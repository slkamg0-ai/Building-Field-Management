'use server'

import prisma from './prisma'
import { revalidatePath } from 'next/cache'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

// ════════════════════════════════════════════════════════════════
//  현장 관리
// ════════════════════════════════════════════════════════════════
export async function getSites() {
  return prisma.site.findMany({ orderBy: { createdAt: 'desc' } })
}

export async function createSite(name: string, contractAmount: number, startDate: string, endDate: string) {
  const data = await prisma.site.create({
    data: { name, contractAmount, startDate: new Date(startDate), endDate: new Date(endDate) },
  })
  revalidatePath('/')
  return data
}

export async function updateSite(id: string, name: string, contractAmount: number, startDate: string, endDate: string) {
  const data = await prisma.site.update({
    where: { id },
    data: { name, contractAmount, startDate: new Date(startDate), endDate: new Date(endDate) },
  })
  revalidatePath('/')
  return data
}

export async function resetSiteData(siteId: string) {
  await prisma.dailyLog.deleteMany({ where: { siteId } })
  revalidatePath('/')
}

// ════════════════════════════════════════════════════════════════
//  사용자 / 로그인
// ════════════════════════════════════════════════════════════════
export async function login(name: string, pin: string) {
  const user = await prisma.user.findFirst({ where: { name, isActive: true } })
  if (user && user.pin === pin) return { id: user.id, name: user.name, role: user.role }
  return null
}

export async function getUsers() {
  const users = await prisma.user.findMany({ orderBy: { name: 'asc' } })
  if (users.length === 0) {
    const admin = await prisma.user.create({ data: { name: '관리자', pin: '0000', role: 'ADMIN' } })
    return [admin]
  }
  return users
}

export async function createUser(name: string, pin: string, role: string = 'WORKER') {
  const data = await prisma.user.create({ data: { name, pin, role } })
  revalidatePath('/')
  return data
}

export async function deleteUser(id: string) {
  await prisma.user.delete({ where: { id } })
  revalidatePath('/')
}

export async function updateUserRole(id: string, role: string) {
  await prisma.user.update({ where: { id }, data: { role } })
  revalidatePath('/')
}

export async function updateUserPin(id: string, newPin: string) {
  await prisma.user.update({ where: { id }, data: { pin: newPin } })
  revalidatePath('/')
}

export async function toggleUserActive(id: string, isActive: boolean) {
  await prisma.user.update({ where: { id }, data: { isActive } })
  revalidatePath('/')
}

// ════════════════════════════════════════════════════════════════
//  일일 로그
// ════════════════════════════════════════════════════════════════
export async function getDailyLog(dateString: string, siteId: string) {
  const startOfDay = new Date(dateString); startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(dateString); endOfDay.setHours(23, 59, 59, 999)

  const log = await prisma.dailyLog.findFirst({
    where: { siteId, date: { gte: startOfDay, lte: endOfDay } },
    include: { labors: true, equipments: true, materials: true, expenses: true, outsourcings: true, photos: true },
  })
  if (log) return log

  const newLog = await prisma.dailyLog.create({ data: { siteId, date: startOfDay } })
  return { ...newLog, labors: [], equipments: [], materials: [], expenses: [], outsourcings: [], photos: [] }
}

// 노무/장비/자재/경비/외주 추가
export async function addLabor(logId: string, data: any, creatorName: string) {
  await prisma.labor.create({ data: {
    logId, name: data.name, jobType: data.jobType,
    unitPrice: parseInt(data.unitPrice), amount: parseFloat(data.amount),
    totalPrice: parseInt(data.unitPrice) * parseFloat(data.amount),
    note: data.note || null, createdBy: creatorName,
  } })
  revalidatePath('/')
}

export async function addEquipment(logId: string, data: any, creatorName: string) {
  await prisma.equipment.create({ data: {
    logId, name: data.name, spec: data.spec || null,
    unitPrice: parseInt(data.unitPrice), amount: parseFloat(data.amount),
    totalPrice: parseInt(data.unitPrice) * parseFloat(data.amount),
    note: data.note || null, createdBy: creatorName,
  } })
  revalidatePath('/')
}

export async function addMaterial(logId: string, data: any, creatorName: string) {
  await prisma.material.create({ data: {
    logId, name: data.name, spec: data.spec || null, unit: data.unit,
    quantity: parseFloat(data.quantity), note: data.note || null, createdBy: creatorName,
  } })
  revalidatePath('/')
}

export async function addExpense(logId: string, data: any, creatorName: string) {
  await prisma.expense.create({ data: {
    logId, category: data.category, amount: parseInt(data.amount),
    note: data.note || null, createdBy: creatorName,
    assignedTo: data.assignedTo || creatorName,
  } })
  revalidatePath('/')
}

// 월별 담당자별 경비 (정산용)
export async function getMonthlyExpensesByPerson(siteId: string, year: number, month: number) {
  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)
  const logs = await prisma.dailyLog.findMany({
    where: { siteId, date: { gte: startOfMonth, lte: endOfMonth } },
    select: { id: true },
  })
  if (logs.length === 0) return []
  const expenses = await prisma.expense.findMany({ where: { logId: { in: logs.map(l => l.id) } } })
  if (expenses.length === 0) return []

  const byPerson: Record<string, { total: number, unsettledTotal: number, settledTotal: number, items: any[] }> = {}
  for (const exp of expenses) {
    const person = exp.assignedTo || exp.createdBy || '미지정'
    if (!byPerson[person]) byPerson[person] = { total: 0, unsettledTotal: 0, settledTotal: 0, items: [] }
    byPerson[person].total += exp.amount
    if (exp.isSettled) byPerson[person].settledTotal += exp.amount
    else byPerson[person].unsettledTotal += exp.amount
    byPerson[person].items.push(exp)
  }
  return Object.entries(byPerson).map(([person, data]) => ({ person, ...data }))
}

export async function settleExpenses(expenseIds: string[]) {
  await prisma.expense.updateMany({ where: { id: { in: expenseIds } }, data: { isSettled: true, settledAt: new Date() } })
  revalidatePath('/')
}

export async function addOutsourcing(logId: string, data: any, creatorName: string) {
  await prisma.outsourcing.create({ data: {
    logId, companyName: data.company, task: data.task,
    amount: parseInt(data.amount), note: data.note || null, createdBy: creatorName,
  } })
  revalidatePath('/')
}

export async function updateDailyLogDescription(logId: string, description: string) {
  await prisma.dailyLog.update({ where: { id: logId }, data: { description } })
  revalidatePath('/')
}

export async function addPhotoRecord(logId: string, url: string, creatorName: string) {
  await prisma.photo.create({ data: { logId, url, createdBy: creatorName } })
  revalidatePath('/')
}

export async function deletePhoto(photoId: string) {
  await prisma.photo.delete({ where: { id: photoId } })
  revalidatePath('/')
}

// base64(dataURL) → 로컬 /app/uploads 저장 → 접근 URL 반환 (헬퍼)
async function saveImageToLocal(dataUrl: string, prefix: string) {
  const m = dataUrl.match(/^data:(.+?);base64,(.*)$/)
  if (!m) throw new Error('잘못된 이미지 형식')
  const buffer = Buffer.from(m[2], 'base64')
  const fileName = `${prefix}_${Date.now()}.jpg`
  const dir = path.join(process.cwd(), 'uploads')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, fileName), buffer)
  return `/api/uploads/${fileName}`
}

// 범용 이미지 업로드(얼굴/출퇴근 사진 등) — URL만 반환
export async function uploadImage(dataUrl: string, prefix: string = 'img') {
  return saveImageToLocal(dataUrl, prefix)
}

// 작업일보 사진 업로드 — 저장 + Photo 레코드
export async function uploadPhoto(logId: string, dataUrl: string, creatorName?: string | null) {
  const url = await saveImageToLocal(dataUrl, logId)
  await prisma.photo.create({ data: { logId, url, createdBy: creatorName ?? null } })
  revalidatePath('/')
  return url
}

// 자동완성 검색
export async function searchLabors(query: string) {
  if (!query || query.length < 1) return []
  const data = await prisma.labor.findMany({
    where: { name: { contains: query, mode: 'insensitive' } },
    select: { name: true, jobType: true, unitPrice: true }, take: 20,
  })
  const seen = new Set<string>()
  return data.filter(r => { if (seen.has(r.name)) return false; seen.add(r.name); return true }).slice(0, 5)
}

export async function searchEquipments(query: string) {
  if (!query || query.length < 1) return []
  const data = await prisma.equipment.findMany({
    where: { name: { contains: query, mode: 'insensitive' } },
    select: { name: true, spec: true, unitPrice: true }, take: 20,
  })
  const seen = new Set<string>()
  return data.filter(r => { if (seen.has(r.name)) return false; seen.add(r.name); return true }).slice(0, 5)
}

export async function searchMaterials(query: string) {
  if (!query || query.length < 1) return []
  const data = await prisma.material.findMany({
    where: { name: { contains: query, mode: 'insensitive' } },
    select: { name: true, spec: true, unit: true }, take: 20,
  })
  const seen = new Set<string>()
  return data.filter(r => { if (seen.has(r.name)) return false; seen.add(r.name); return true }).slice(0, 5)
}

export async function searchOutsourcings(query: string) {
  if (!query || query.length < 1) return []
  const data = await prisma.outsourcing.findMany({
    where: { companyName: { contains: query, mode: 'insensitive' } },
    select: { companyName: true, task: true }, take: 20,
  })
  const seen = new Set<string>()
  return data.filter(r => { if (seen.has(r.companyName)) return false; seen.add(r.companyName); return true }).slice(0, 5)
}

// ════════════════════════════════════════════════════════════════
//  통계
// ════════════════════════════════════════════════════════════════
export async function getMonthlyStats(siteId: string, dateString: string) {
  const date = new Date(dateString)
  const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1)
  const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59)

  const logs = await prisma.dailyLog.findMany({
    where: { siteId, date: { gte: startOfMonth, lte: endOfMonth } },
    include: { labors: true, equipments: true, expenses: true, outsourcings: true },
    orderBy: { date: 'asc' },
  })

  let totalLabor = 0, totalEquipment = 0, totalExpense = 0, totalOutsourcing = 0
  const dailyData = logs.map(log => {
    const lPrice = log.labors.reduce((s, i) => s + i.totalPrice, 0)
    const ePrice = log.equipments.reduce((s, i) => s + i.totalPrice, 0)
    const xPrice = log.expenses.reduce((s, i) => s + i.amount, 0)
    const oPrice = log.outsourcings.reduce((s, i) => s + i.amount, 0)
    totalLabor += lPrice; totalEquipment += ePrice; totalExpense += xPrice; totalOutsourcing += oPrice
    return {
      name: new Date(log.date).getDate() + '일',
      노무비: lPrice, 장비대: ePrice, 외주비: oPrice, 경비: xPrice,
      총비용: lPrice + ePrice + oPrice + xPrice,
    }
  })

  return {
    summary: {
      totalLabor, totalEquipment, totalExpense, totalOutsourcing,
      grandTotal: totalLabor + totalEquipment + totalExpense + totalOutsourcing,
    },
    dailyData,
    monthlyLogs: logs.map(log => ({
      date: log.date,
      labors: log.labors,
      equipments: log.equipments,
      expenses: log.expenses,
      outsourcings: log.outsourcings,
    })),
  }
}

export async function getSiteTotalStats(siteId: string) {
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) return null

  const logs = await prisma.dailyLog.findMany({
    where: { siteId },
    include: { labors: true, equipments: true, expenses: true, outsourcings: true },
  })

  let totalLabor = 0, totalEquipment = 0, totalExpense = 0, totalOutsourcing = 0
  logs.forEach(log => {
    totalLabor += log.labors.reduce((s, i) => s + i.totalPrice, 0)
    totalEquipment += log.equipments.reduce((s, i) => s + i.totalPrice, 0)
    totalExpense += log.expenses.reduce((s, i) => s + i.amount, 0)
    totalOutsourcing += log.outsourcings.reduce((s, i) => s + i.amount, 0)
  })

  const grandTotal = totalLabor + totalEquipment + totalExpense + totalOutsourcing
  const startDate = new Date(site.startDate)
  const endDate = new Date(site.endDate)
  const totalDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000))
  const passedDays = Math.max(0, Math.ceil((Date.now() - startDate.getTime()) / 86400000))
  const dailyLimit = site.contractAmount / totalDays

  return {
    site, totalSpent: grandTotal, dailyLimit, totalDays, passedDays,
    progressPercent: site.contractAmount > 0 ? (grandTotal / site.contractAmount) * 100 : 0,
  }
}

// ════════════════════════════════════════════════════════════════
//  근로자(인적사항/신원) + 출퇴근
// ════════════════════════════════════════════════════════════════
export async function getWorkers(includeInactive: boolean = false) {
  return prisma.worker.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: 'asc' },
  })
}

export async function createWorker(data: any) {
  const row = await prisma.worker.create({ data: {
    name: data.name,
    phone: data.phone || null,
    company: data.company || null,
    jobType: data.jobType || null,
    birthDate: data.birthDate ? new Date(data.birthDate) : null,
    gender: data.gender || null,
    safetyEduDate: data.safetyEduDate ? new Date(data.safetyEduDate) : null,
    basicSafetyEdu: !!data.basicSafetyEdu,
    photoUrl: data.photoUrl || null,
    faceDescriptor: data.faceDescriptor ?? undefined,
    isActive: true,
  } })
  revalidatePath('/workers')
  return row
}

export async function updateWorker(id: string, data: any) {
  const patch: any = {}
  for (const f of ['name', 'phone', 'company', 'jobType', 'gender', 'photoUrl', 'isActive', 'basicSafetyEdu']) {
    if (data[f] !== undefined) patch[f] = data[f]
  }
  if (data.birthDate !== undefined) patch.birthDate = data.birthDate ? new Date(data.birthDate) : null
  if (data.safetyEduDate !== undefined) patch.safetyEduDate = data.safetyEduDate ? new Date(data.safetyEduDate) : null
  if (data.faceDescriptor !== undefined) patch.faceDescriptor = data.faceDescriptor
  await prisma.worker.update({ where: { id }, data: patch })
  revalidatePath('/workers')
}

export async function deleteWorker(id: string) {
  await prisma.worker.delete({ where: { id } })
  revalidatePath('/workers')
}

// 출근: 하루 1행. 이미 출근돼 있으면 그대로 반환.
export async function checkIn(data: {
  workerId: string; date: string; siteId?: string | null; siteName?: string | null
  photoUrl?: string | null; lat?: number | null; lng?: number | null; score?: number | null; verifyStatus?: string
}) {
  const dateVal = new Date(data.date)
  const existing = await prisma.attendance.findUnique({
    where: { workerId_date: { workerId: data.workerId, date: dateVal } },
  })
  if (existing && existing.checkInAt) return { record: existing, already: true as const }

  if (existing) {
    const row = await prisma.attendance.update({
      where: { id: existing.id },
      data: {
        siteId: data.siteId ?? existing.siteId,
        siteName: data.siteName ?? existing.siteName,
        checkInAt: new Date(),
        checkInPhotoUrl: data.photoUrl ?? null,
        checkInLat: data.lat ?? null, checkInLng: data.lng ?? null, checkInScore: data.score ?? null,
        verifyStatus: data.verifyStatus || 'REVIEW',
      },
    })
    return { record: row, already: false as const }
  }

  const row = await prisma.attendance.create({
    data: {
      workerId: data.workerId, siteId: data.siteId ?? null, siteName: data.siteName ?? null,
      date: dateVal, checkInAt: new Date(),
      checkInPhotoUrl: data.photoUrl ?? null,
      checkInLat: data.lat ?? null, checkInLng: data.lng ?? null, checkInScore: data.score ?? null,
      verifyStatus: data.verifyStatus || 'REVIEW',
    },
  })
  return { record: row, already: false as const }
}

// 퇴근: 당일 기록에 퇴근정보 + 근무시간(분) 자동계산
export async function checkOut(data: {
  workerId: string; date: string; photoUrl?: string | null; lat?: number | null; lng?: number | null; score?: number | null
}) {
  const dateVal = new Date(data.date)
  const existing = await prisma.attendance.findUnique({
    where: { workerId_date: { workerId: data.workerId, date: dateVal } },
  })
  if (!existing || !existing.checkInAt) throw new Error('출근 기록이 없습니다. 먼저 출근 체크를 해주세요.')
  if (existing.checkOutAt) return { record: existing, already: true as const }

  const now = new Date()
  const workMinutes = Math.max(0, Math.round((now.getTime() - new Date(existing.checkInAt).getTime()) / 60000))
  const row = await prisma.attendance.update({
    where: { id: existing.id },
    data: {
      checkOutAt: now, checkOutPhotoUrl: data.photoUrl ?? null,
      checkOutLat: data.lat ?? null, checkOutLng: data.lng ?? null, checkOutScore: data.score ?? null,
      workMinutes,
    },
  })
  return { record: row, already: false as const }
}

export async function setAttendanceVerify(id: string, verifyStatus: string, note?: string) {
  const patch: any = { verifyStatus }
  if (note !== undefined) patch.note = note
  await prisma.attendance.update({ where: { id }, data: patch })
  revalidatePath('/workers')
}

export async function getTodayAttendance(workerId: string, date: string) {
  return prisma.attendance.findUnique({
    where: { workerId_date: { workerId, date: new Date(date) } },
  })
}

// 날짜별 전체 출퇴근 (근로자 조인) — 프론트가 r.Worker로 읽으므로 Worker 키 유지
export async function getAttendanceByDate(date: string) {
  const rows = await prisma.attendance.findMany({
    where: { date: new Date(date) },
    include: { worker: true },
    orderBy: { checkInAt: 'asc' },
  })
  return rows.map(r => ({ ...r, Worker: r.worker }))
}

// 웹 푸시 구독 저장 (endpoint 중복 시 갱신)
export async function savePushSub(sub: { endpoint: string; p256dh: string; auth: string }, label?: string, userName?: string) {
  const row = await prisma.pushSub.upsert({
    where: { endpoint: sub.endpoint },
    update: { p256dh: sub.p256dh, auth: sub.auth, label: label ?? null, userName: userName ?? null },
    create: { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, label: label ?? null, userName: userName ?? null },
  })
  return row.id
}

// 월별 출퇴근 (정산/집계용)
export async function getAttendanceByMonth(year: number, month: number, siteId?: string) {
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59)
  const rows = await prisma.attendance.findMany({
    where: { date: { gte: start, lte: end }, ...(siteId ? { siteId } : {}) },
    include: { worker: true },
    orderBy: { date: 'asc' },
  })
  return rows.map(r => ({ ...r, Worker: r.worker }))
}
