'use server'

import prisma from '../prisma'
import { revalidatePath } from 'next/cache'
import { requireAdmin, requireSiteAccess } from '../auth'
import { requireLogSiteAccess } from './_shared'

// ════════════════════════════════════════════════════════════════
//  기성관리 — 계약품목(내역서) / 일일 시공수량 / 월별 기성청구
//  "원가관리(노무/장비/자재/경비/외주)"와는 완전히 별개의 축.
//  계약품목×계약단가로 산정되는 게 기성(청구액), 실제 투입비용 합이 원가.
// ════════════════════════════════════════════════════════════════
export async function getContractItems(siteId: string) {
  await requireSiteAccess(siteId)
  return prisma.contractItem.findMany({
    where: { siteId, isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
}

// 엑셀에서 파싱한 내역서 행을 그대로 덮어쓰기(재수입) 방식으로 저장.
// 트리 구조 대신 원본 순서(sortOrder)를 보존하는 평면 목록으로 저장한다 —
// 구분코드가 중복/분할되는 실제 내역서 특성상 트리 자동 구성은 신뢰도가 낮기 때문.
export async function importContractItems(siteId: string, rows: Array<{
  code?: string; name: string; spec?: string; unit?: string
  quantity?: number | null; unitPrice?: number | null; amount?: number | null; note?: string
}>) {
  await requireAdmin()
  if (!rows.length) throw new Error('가져올 내역이 없습니다.')

  // 행이 수백 개일 수 있어 하나씩 create하면(interactive transaction) 기본 타임아웃(5초)을
  // 넘겨 "Transaction not found" 오류가 난다. createMany로 한 번에 묶어서 처리한다.
  let sortOrder = 0
  const data = rows
    .map(row => {
      const name = String(row.name || '').trim()
      if (!name) return null
      const quantity = row.quantity ?? null
      const unitPrice = row.unitPrice ?? null
      const isLeaf = !!(row.unit && quantity != null && unitPrice != null)
      const amount = row.amount ?? (isLeaf ? Math.round((quantity || 0) * (unitPrice || 0)) : 0)
      return {
        siteId,
        code: row.code || null,
        name,
        spec: row.spec || null,
        unit: row.unit || null,
        isLeaf,
        contractQuantity: quantity,
        contractUnitPrice: unitPrice,
        contractAmount: amount,
        category: row.note || null,
        sortOrder: sortOrder++,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  await prisma.$transaction([
    prisma.contractItem.updateMany({ where: { siteId, isActive: true }, data: { isActive: false } }),
    prisma.contractItem.createMany({ data }),
  ])
  revalidatePath('/')
  return { imported: rows.length }
}

export async function createContractItem(siteId: string, data: any) {
  await requireAdmin()
  const quantity = data.quantity !== '' && data.quantity != null ? parseFloat(data.quantity) : null
  const unitPrice = data.unitPrice !== '' && data.unitPrice != null ? parseInt(data.unitPrice) : null
  const isLeaf = data.isLeaf !== undefined ? !!data.isLeaf : true
  const amount = isLeaf && quantity != null && unitPrice != null ? Math.round(quantity * unitPrice) : 0
  const last = await prisma.contractItem.findFirst({ where: { siteId }, orderBy: { sortOrder: 'desc' } })
  const row = await prisma.contractItem.create({
    data: {
      siteId, name: data.name, code: data.code || null, spec: data.spec || null,
      unit: data.unit || null, isLeaf, contractQuantity: quantity, contractUnitPrice: unitPrice,
      contractAmount: amount, category: data.category || null, sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  })
  revalidatePath('/')
  return row
}

export async function updateContractItem(id: string, data: any) {
  await requireAdmin()
  const existing = await prisma.contractItem.findUnique({ where: { id } })
  if (!existing) throw new Error('품목을 찾을 수 없습니다.')
  const patch: any = {}
  for (const f of ['name', 'code', 'spec', 'unit', 'category']) {
    if (data[f] !== undefined) patch[f] = data[f] || null
  }
  if (data.isLeaf !== undefined) patch.isLeaf = !!data.isLeaf
  const quantity = data.quantity !== undefined ? (data.quantity !== '' && data.quantity != null ? parseFloat(data.quantity) : null) : existing.contractQuantity
  const unitPrice = data.unitPrice !== undefined ? (data.unitPrice !== '' && data.unitPrice != null ? parseInt(data.unitPrice) : null) : existing.contractUnitPrice
  if (data.quantity !== undefined) patch.contractQuantity = quantity
  if (data.unitPrice !== undefined) patch.contractUnitPrice = unitPrice
  if (data.quantity !== undefined || data.unitPrice !== undefined) {
    patch.contractAmount = quantity != null && unitPrice != null ? Math.round(quantity * unitPrice) : existing.contractAmount
  }
  await prisma.contractItem.update({ where: { id }, data: patch })
  revalidatePath('/')
}

export async function deleteContractItem(id: string) {
  await requireAdmin()
  await prisma.contractItem.update({ where: { id }, data: { isActive: false } })
  revalidatePath('/')
}

// 계약품목별 누적 시공수량 — 계약수량 대비 진행률(잔량) 확인용
export async function getContractItemProgress(siteId: string) {
  await requireSiteAccess(siteId)
  const items = await prisma.contractItem.findMany({ where: { siteId, isActive: true, isLeaf: true }, orderBy: { sortOrder: 'asc' } })
  const sums = await prisma.workQuantity.groupBy({
    by: ['contractItemId'],
    where: { contractItem: { siteId, isActive: true } },
    _sum: { quantity: true },
  })
  const sumMap = new Map(sums.map(s => [s.contractItemId, s._sum.quantity || 0]))
  return items.map(item => {
    const done = sumMap.get(item.id) || 0
    const unitPrice = item.contractUnitPrice || 0
    return {
      ...item,
      doneQuantity: done,
      doneAmount: Math.round(done * unitPrice),
      remainQuantity: item.contractQuantity != null ? Math.max(0, item.contractQuantity - done) : null,
      progressPercent: item.contractQuantity ? Math.min(100, (done / item.contractQuantity) * 100) : null,
    }
  })
}

// ── 일일 시공수량 ──
export async function getWorkQuantities(logId: string) {
  await requireLogSiteAccess(logId)
  return prisma.workQuantity.findMany({ where: { logId }, include: { contractItem: true }, orderBy: { createdAt: 'asc' } })
}

export async function addWorkQuantity(logId: string, contractItemId: string, quantity: number, note?: string) {
  const { user } = await requireLogSiteAccess(logId)
  const row = await prisma.workQuantity.create({
    data: { logId, contractItemId, quantity, note: note || null, createdBy: user.name },
  })
  revalidatePath('/')
  return row
}

export async function updateWorkQuantity(id: string, quantity: number, note?: string) {
  const record = await prisma.workQuantity.findUnique({ where: { id }, select: { logId: true } })
  if (!record) throw new Error('존재하지 않는 항목입니다.')
  await requireLogSiteAccess(record.logId)
  await prisma.workQuantity.update({ where: { id }, data: { quantity, ...(note !== undefined ? { note } : {}) } })
  revalidatePath('/')
}

export async function deleteWorkQuantity(id: string) {
  const record = await prisma.workQuantity.findUnique({ where: { id }, select: { logId: true } })
  if (!record) throw new Error('존재하지 않는 항목입니다.')
  await requireLogSiteAccess(record.logId)
  await prisma.workQuantity.delete({ where: { id } })
  revalidatePath('/')
}

// ── 월별 기성청구서 ──
export async function getMonthlyProgressClaim(siteId: string, year: number, month: number) {
  await requireSiteAccess(siteId)
  return prisma.monthlyProgressClaim.findUnique({ where: { siteId_year_month: { siteId, year, month } } })
}

export async function getProgressClaimHistory(siteId: string) {
  await requireSiteAccess(siteId)
  return prisma.monthlyProgressClaim.findMany({ where: { siteId }, orderBy: [{ year: 'desc' }, { month: 'desc' }] })
}

// 이번달까지의 누적 시공수량×계약단가로 누적기성고를 구하고, 전월 누적기성고를 빼서
// 이번달 청구액을 산출한다. 실투입원가(원가관리 데이터 합)도 함께 캐시해 손익을 비교한다.
export async function generateMonthlyProgressClaim(siteId: string, year: number, month: number) {
  const user = await requireAdmin()
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)
  const prevMonthEnd = new Date(year, month - 1, 0, 23, 59, 59)

  const items = await prisma.contractItem.findMany({ where: { siteId, isActive: true, isLeaf: true } })
  const priceMap = new Map(items.map(i => [i.id, i.contractUnitPrice || 0]))

  const cumulativeGroups = await prisma.workQuantity.groupBy({
    by: ['contractItemId'],
    where: { contractItem: { siteId, isActive: true }, log: { date: { lte: endOfMonth } } },
    _sum: { quantity: true },
  })
  const cumulativeClaimAmount = cumulativeGroups.reduce(
    (sum, g) => sum + Math.round((g._sum.quantity || 0) * (priceMap.get(g.contractItemId) || 0)), 0
  )

  const prevGroups = await prisma.workQuantity.groupBy({
    by: ['contractItemId'],
    where: { contractItem: { siteId, isActive: true }, log: { date: { lte: prevMonthEnd } } },
    _sum: { quantity: true },
  })
  const prevCumulative = prevGroups.reduce(
    (sum, g) => sum + Math.round((g._sum.quantity || 0) * (priceMap.get(g.contractItemId) || 0)), 0
  )
  const totalClaimAmount = cumulativeClaimAmount - prevCumulative

  const startOfMonth = new Date(year, month - 1, 1)
  const [monthLogs, cumulativeLogs] = await Promise.all([
    prisma.dailyLog.findMany({
      where: { siteId, date: { gte: startOfMonth, lte: endOfMonth } },
      include: { labors: true, equipments: true, materials: true, expenses: true, outsourcings: true },
    }),
    prisma.dailyLog.findMany({
      where: { siteId, date: { lte: endOfMonth } },
      include: { labors: true, equipments: true, materials: true, expenses: true, outsourcings: true },
    }),
  ])
  const sumCost = (logs: typeof monthLogs) => logs.reduce((total, log) => {
    total += log.labors.reduce((s, i) => s + i.totalPrice, 0)
    total += log.equipments.reduce((s, i) => s + i.totalPrice, 0)
    total += log.materials.reduce((s, i) => s + (i.totalPrice || 0), 0)
    total += log.expenses.reduce((s, i) => s + i.amount, 0)
    total += log.outsourcings.reduce((s, i) => s + i.amount, 0)
    return total
  }, 0)
  const totalCostAmount = sumCost(monthLogs)
  const cumulativeCostAmount = sumCost(cumulativeLogs)
  const profitAmount = totalClaimAmount - totalCostAmount
  const cumulativeProfitAmount = cumulativeClaimAmount - cumulativeCostAmount

  const claim = await prisma.monthlyProgressClaim.upsert({
    where: { siteId_year_month: { siteId, year, month } },
    update: { totalClaimAmount, cumulativeClaimAmount, totalCostAmount, profitAmount, cumulativeCostAmount, cumulativeProfitAmount, createdBy: user.name },
    create: { siteId, year, month, totalClaimAmount, cumulativeClaimAmount, totalCostAmount, profitAmount, cumulativeCostAmount, cumulativeProfitAmount, createdBy: user.name },
  })
  revalidatePath('/')
  return claim
}

// ── 월별 투입명세서(원가) — 그달 노무/장비/자재/경비/외주 취합. 지급 결정용 상세 문서.
export async function getMonthlyCostDetail(siteId: string, year: number, month: number) {
  await requireSiteAccess(siteId)
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) throw new Error('현장을 찾을 수 없습니다.')

  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)
  const logs = await prisma.dailyLog.findMany({
    where: { siteId, date: { gte: startOfMonth, lte: endOfMonth } },
    include: { labors: true, equipments: true, materials: true, expenses: true, outsourcings: true },
    orderBy: { date: 'asc' },
  })

  const daysInMonth = endOfMonth.getDate()

  // 노무/장비: 인원(장비)별로 일자별 공수를 캘린더 칸에 채워넣는다 — 기존에 쓰던 출력일수 캘린더 양식과 동일한 구조.
  type CalendarRow = { key: string; name: string; sub: string; days: Record<number, number>; totalAmount: number; totalPrice: number }
  const laborMap = new Map<string, CalendarRow>()
  const equipmentMap = new Map<string, CalendarRow>()
  const materials: any[] = []
  const expenseMap = new Map<string, { category: string; amount: number }>()
  const outsourcingMap = new Map<string, { companyName: string; task: string; amount: number }>()

  for (const log of logs) {
    const day = new Date(log.date).getDate()
    for (const l of log.labors) {
      const key = `${l.name}::${l.jobType}`
      const cur = laborMap.get(key) || { key, name: l.name, sub: l.jobType, days: {}, totalAmount: 0, totalPrice: 0 }
      cur.days[day] = (cur.days[day] || 0) + l.amount
      cur.totalAmount += l.amount
      cur.totalPrice += l.totalPrice
      laborMap.set(key, cur)
    }
    for (const e of log.equipments) {
      const key = `${e.name}::${e.ownerType}`
      const cur = equipmentMap.get(key) || { key, name: e.name, sub: e.ownerType === 'DIRECT' ? '원청 직영' : '당사 투입', days: {}, totalAmount: 0, totalPrice: 0 }
      cur.days[day] = (cur.days[day] || 0) + e.amount
      cur.totalAmount += e.amount
      cur.totalPrice += e.totalPrice
      equipmentMap.set(key, cur)
    }
    for (const m of log.materials) {
      materials.push({ date: log.date, name: m.name, spec: m.spec, unit: m.unit, quantity: m.quantity, totalPrice: m.totalPrice || 0 })
    }
    for (const ex of log.expenses) {
      const key = ex.category
      const cur = expenseMap.get(key) || { category: ex.category, amount: 0 }
      cur.amount += ex.amount
      expenseMap.set(key, cur)
    }
    for (const o of log.outsourcings) {
      const key = `${o.companyName}::${o.task}`
      const cur = outsourcingMap.get(key) || { companyName: o.companyName, task: o.task, amount: 0 }
      cur.amount += o.amount
      outsourcingMap.set(key, cur)
    }
  }

  const labors = Array.from(laborMap.values())
    .map(r => ({ ...r, unitPrice: r.totalAmount > 0 ? Math.round(r.totalPrice / r.totalAmount) : 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const equipments = Array.from(equipmentMap.values())
    .map(r => ({ ...r, unitPrice: r.totalAmount > 0 ? Math.round(r.totalPrice / r.totalAmount) : 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const expenses = Array.from(expenseMap.values()).sort((a, b) => a.category.localeCompare(b.category, 'ko'))
  const outsourcings = Array.from(outsourcingMap.values()).sort((a, b) => a.companyName.localeCompare(b.companyName, 'ko'))

  const totals = {
    labor: labors.reduce((s, i) => s + i.totalPrice, 0),
    equipment: equipments.reduce((s, i) => s + i.totalPrice, 0),
    material: materials.reduce((s, i) => s + i.totalPrice, 0),
    expense: expenses.reduce((s, i) => s + i.amount, 0),
    outsourcing: outsourcings.reduce((s, i) => s + i.amount, 0),
  }
  const grandTotal = totals.labor + totals.equipment + totals.material + totals.expense + totals.outsourcing

  return { site, daysInMonth, labors, equipments, materials, expenses, outsourcings, totals, grandTotal }
}

export async function updateProgressClaimStatus(id: string, status: string, note?: string) {
  await requireAdmin()
  const patch: any = { status }
  if (status === 'SUBMITTED') patch.submittedAt = new Date()
  if (status === 'CONFIRMED') patch.confirmedAt = new Date()
  if (note !== undefined) patch.note = note
  await prisma.monthlyProgressClaim.update({ where: { id }, data: patch })
  revalidatePath('/')
}

// 기성청구서 품목별 상세 — 이번달/누적 시공수량과 금액을 계약품목별로 계산.
// 엑셀 내보내기(자유 양식)용 원천 데이터.
export async function getProgressClaimItemDetail(siteId: string, year: number, month: number) {
  await requireSiteAccess(siteId)
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) throw new Error('현장을 찾을 수 없습니다.')

  const endOfMonth = new Date(year, month, 0, 23, 59, 59)
  const startOfMonth = new Date(year, month - 1, 1)

  const items = await prisma.contractItem.findMany({
    where: { siteId, isActive: true, isLeaf: true },
    orderBy: { sortOrder: 'asc' },
  })

  const [monthGroups, cumulativeGroups] = await Promise.all([
    prisma.workQuantity.groupBy({
      by: ['contractItemId'],
      where: { contractItem: { siteId, isActive: true }, log: { date: { gte: startOfMonth, lte: endOfMonth } } },
      _sum: { quantity: true },
    }),
    prisma.workQuantity.groupBy({
      by: ['contractItemId'],
      where: { contractItem: { siteId, isActive: true }, log: { date: { lte: endOfMonth } } },
      _sum: { quantity: true },
    }),
  ])
  const monthMap = new Map(monthGroups.map(g => [g.contractItemId, g._sum.quantity || 0]))
  const cumulativeMap = new Map(cumulativeGroups.map(g => [g.contractItemId, g._sum.quantity || 0]))

  const rows = items.map(item => {
    const unitPrice = item.contractUnitPrice || 0
    const monthQuantity = monthMap.get(item.id) || 0
    const cumulativeQuantity = cumulativeMap.get(item.id) || 0
    return {
      code: item.code || '',
      name: item.name,
      spec: item.spec || '',
      unit: item.unit || '',
      contractQuantity: item.contractQuantity,
      contractUnitPrice: unitPrice,
      contractAmount: item.contractAmount,
      monthQuantity,
      monthAmount: Math.round(monthQuantity * unitPrice),
      cumulativeQuantity,
      cumulativeAmount: Math.round(cumulativeQuantity * unitPrice),
      remainQuantity: item.contractQuantity != null ? Math.max(0, item.contractQuantity - cumulativeQuantity) : null,
    }
  }).filter(r => r.monthQuantity !== 0 || r.cumulativeQuantity !== 0)

  return { site, rows }
}

