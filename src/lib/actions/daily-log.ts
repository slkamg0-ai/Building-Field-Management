'use server'

import prisma from '../prisma'
import { revalidatePath } from 'next/cache'
import { uploadDataUrlToR2, deleteFromR2 } from '../r2'
import { requireAdmin, requireSiteAccess, requireUser } from '../auth'
import { requireLogSiteAccess, requireRecordSiteAccess } from './_shared'

// ════════════════════════════════════════════════════════════════
//  일일 로그 및 DB 스키마 자가 치유(Self-Healing) 마이그레이션
// ════════════════════════════════════════════════════════════════
let schemaEnsured = false

export async function ensureSchemaUpdated() {
  if (schemaEnsured) return
  try {
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='Labor' AND column_name='workerId'
        ) THEN
          ALTER TABLE "Labor" ADD COLUMN "workerId" TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name='Equipment' AND column_name='equipmentMasterId'
        ) THEN
          ALTER TABLE "Equipment" ADD COLUMN "equipmentMasterId" TEXT;
        END IF;
      END $$;
    `)

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "EquipmentMaster" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "name" TEXT NOT NULL,
        "spec" TEXT,
        "ownerType" TEXT NOT NULL DEFAULT 'SUBCONTRACT',
        "driverName" TEXT,
        "driverPhone" TEXT,
        "unitPrice" INTEGER NOT NULL DEFAULT 0,
        "documentStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
        "documentUrl" TEXT,
        "note" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "EquipmentDocument" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "equipmentId" TEXT,
        "documentType" TEXT NOT NULL,
        "fileUrl" TEXT NOT NULL,
        "extractedData" JSONB,
        "status" TEXT NOT NULL DEFAULT 'REVIEW',
        "note" TEXT,
        "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "Labor_workerId_idx" ON "Labor"("workerId");
      CREATE INDEX IF NOT EXISTS "Equipment_equipmentMasterId_idx" ON "Equipment"("equipmentMasterId");
    `)

    schemaEnsured = true
  } catch (err) {
    console.error('Schema auto-sync error (non-fatal):', err)
  }
}

export async function getDailyLog(dateString: string, siteId: string) {
  await requireSiteAccess(siteId)
  await ensureSchemaUpdated()
  const startOfDay = new Date(dateString); startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(dateString); endOfDay.setHours(23, 59, 59, 999)

  const log = await prisma.dailyLog.findFirst({
    where: { siteId, date: { gte: startOfDay, lte: endOfDay } },
    include: { labors: true, equipments: true, materials: true, expenses: true, outsourcings: true, photos: true },
  })
  if (log) return log

  try {
    const newLog = await prisma.dailyLog.create({ data: { siteId, date: startOfDay } })
    return { ...newLog, labors: [], equipments: [], materials: [], expenses: [], outsourcings: [], photos: [] }
  } catch (e) {
    // 동시성 요청으로 이미 생성된 경우 재조회하여 반환 (P2002 에러 방지)
    const existing = await prisma.dailyLog.findFirst({
      where: { siteId, date: { gte: startOfDay, lte: endOfDay } },
      include: { labors: true, equipments: true, materials: true, expenses: true, outsourcings: true, photos: true },
    })
    if (existing) return existing
    throw e
  }
}

// 노무/장비/자재/경비/외주 추가
export async function addLabor(logId: string, data: any, creatorName: string) {
  const { user } = await requireLogSiteAccess(logId)
  const workerId = data.workerId || null
  await prisma.labor.create({ data: {
    logId,
    workerId,
    name: data.name,
    jobType: data.jobType,
    unitPrice: parseInt(data.unitPrice),
    amount: parseFloat(data.amount),
    totalPrice: parseInt(data.unitPrice) * parseFloat(data.amount),
    note: data.note || null,
    createdBy: user.name,
  } })
  revalidatePath('/')
}

export async function deleteLabor(id: string) {
  await requireRecordSiteAccess(prisma.labor, id)
  await prisma.labor.delete({ where: { id } })
  revalidatePath('/')
}

export async function addEquipment(logId: string, data: any, creatorName: string) {
  const { user } = await requireLogSiteAccess(logId)
  const ownerType = ['DIRECT', 'SUBCONTRACT'].includes(data.ownerType) ? data.ownerType : 'SUBCONTRACT'
  await prisma.equipment.create({ data: {
    logId, name: data.name, spec: data.spec || null,
    unitPrice: parseInt(data.unitPrice), amount: parseFloat(data.amount),
    totalPrice: parseInt(data.unitPrice) * parseFloat(data.amount),
    note: data.note || null, createdBy: user.name,
    ownerType, taskDescription: data.taskDescription || data.task || null,
  } })
  revalidatePath('/')
}

export async function deleteEquipment(id: string) {
  await requireRecordSiteAccess(prisma.equipment, id)
  await prisma.equipment.delete({ where: { id } })
  revalidatePath('/')
}

export async function addMaterial(logId: string, data: any, creatorName: string) {
  const { user } = await requireLogSiteAccess(logId)
  await prisma.material.create({ data: {
    logId, name: data.name, spec: data.spec || null, unit: data.unit,
    quantity: parseFloat(data.quantity), note: data.note || null, createdBy: user.name,
  } })
  revalidatePath('/')
}

export async function deleteMaterial(id: string) {
  await requireRecordSiteAccess(prisma.material, id)
  await prisma.material.delete({ where: { id } })
  revalidatePath('/')
}

export async function addExpense(logId: string, data: any, creatorName: string) {
  const { user } = await requireLogSiteAccess(logId)
  await prisma.expense.create({ data: {
    logId, category: data.category, amount: parseInt(data.amount),
    note: data.note || null, createdBy: user.name,
    assignedTo: data.assignedTo || user.name,
  } })
  revalidatePath('/')
}

export async function deleteExpense(id: string) {
  await requireRecordSiteAccess(prisma.expense, id)
  const expense = await prisma.expense.findUnique({ where: { id } })
  if (expense?.isSettled) throw new Error('이미 정산 완료된 경비는 삭제할 수 없습니다.')
  await prisma.expense.delete({ where: { id } })
  revalidatePath('/')
}

// 월별 담당자별 경비 (정산용)
export async function getMonthlyExpensesByPerson(siteId: string, year: number, month: number) {
  await requireSiteAccess(siteId)
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
  await requireAdmin()
  await prisma.expense.updateMany({ where: { id: { in: expenseIds } }, data: { isSettled: true, settledAt: new Date() } })
  revalidatePath('/')
}

export async function addOutsourcing(logId: string, data: any, creatorName: string) {
  const { user } = await requireLogSiteAccess(logId)
  await prisma.outsourcing.create({ data: {
    logId, companyName: data.company, task: data.task,
    amount: parseInt(data.amount), note: data.note || null, createdBy: user.name,
  } })
  revalidatePath('/')
}

export async function deleteOutsourcing(id: string) {
  await requireRecordSiteAccess(prisma.outsourcing, id)
  await prisma.outsourcing.delete({ where: { id } })
  revalidatePath('/')
}

export async function updateDailyLogDescription(logId: string, description: string) {
  await requireLogSiteAccess(logId)
  await prisma.dailyLog.update({ where: { id: logId }, data: { description } })
  revalidatePath('/')
}

export async function addPhotoRecord(logId: string, url: string, creatorName: string) {
  const { user } = await requireLogSiteAccess(logId)
  await prisma.photo.create({ data: { logId, url, createdBy: user.name } })
  revalidatePath('/')
}

export async function deletePhoto(photoId: string) {
  await requireRecordSiteAccess(prisma.photo, photoId)
  const photo = await prisma.photo.findUnique({ where: { id: photoId } })
  await prisma.photo.delete({ where: { id: photoId } })
  if (photo?.url) {
    try { await deleteFromR2(photo.url) } catch (e) { console.error('R2 삭제 실패(무시):', e) }
  }
  revalidatePath('/')
}

// 범용 이미지 업로드(얼굴/출퇴근 사진 등) — R2에 업로드하고 공개 URL만 반환
export async function uploadImage(dataUrl: string, prefix: string = 'img') {
  await requireUser()
  return uploadDataUrlToR2(dataUrl, prefix)
}

// 작업일보 사진 업로드 — R2 업로드 + Photo 레코드
export async function uploadPhoto(logId: string, dataUrl: string, creatorName?: string | null) {
  const { user } = await requireLogSiteAccess(logId)
  const url = await uploadDataUrlToR2(dataUrl, logId)
  await prisma.photo.create({ data: { logId, url, createdBy: user.name } })
  revalidatePath('/')
  return url
}

// 전일 투입 노무 인력 1-클릭 복제 (아침 조례 시간 90% 단축)
export async function copyPreviousDayLabor(targetLogId: string, siteId: string, currentDateString: string) {
  const { user } = await requireLogSiteAccess(targetLogId)
  const curr = new Date(currentDateString)
  curr.setHours(0, 0, 0, 0)

  // 오늘 이전 가장 최근에 노무 입력이 있었던 일보 찾기
  const prevLog = await prisma.dailyLog.findFirst({
    where: {
      siteId,
      date: { lt: curr },
      labors: { some: {} },
    },
    include: { labors: true },
    orderBy: { date: 'desc' },
  })

  if (!prevLog || prevLog.labors.length === 0) {
    throw new Error('복제할 이전 노무 기록이 없습니다.')
  }

  // 대상 일보의 기존 노무자 확인
  const existingLabors = await prisma.labor.findMany({
    where: { logId: targetLogId },
    select: { name: true, workerId: true },
  })
  const existingSet = new Set(existingLabors.map(l => l.workerId || l.name))

  // 중복되지 않은 인원만 복제
  const toCreate = prevLog.labors.filter(l => !existingSet.has(l.workerId || l.name))
  if (toCreate.length === 0) {
    throw new Error('이전 투입 인원이 이미 모두 등록되어 있습니다.')
  }

  await prisma.labor.createMany({
    data: toCreate.map(l => ({
      logId: targetLogId,
      workerId: l.workerId,
      name: l.name,
      jobType: l.jobType,
      unitPrice: l.unitPrice,
      amount: l.amount || 1,
      totalPrice: l.unitPrice * (l.amount || 1),
      note: l.note || '전일 복제',
      createdBy: user.name,
    })),
  })

  revalidatePath('/')
  return { copiedCount: toCreate.length }
}

// 자동완성 검색 (보안: requireUser() 적용 및 Worker 마스터 연동)
export async function searchLabors(query: string) {
  await requireUser()
  if (!query || query.trim().length < 1) return []
  const q = query.trim()

  // 1. Worker 마스터 검색 (우선순위 높음, 동명이인 구분용 생년월일 포함)
  const masterWorkers = await prisma.worker.findMany({
    where: {
      name: { contains: q, mode: 'insensitive' },
      isActive: true,
    },
    select: { id: true, name: true, jobType: true, birthYYMMDD: true },
    take: 10,
  })

  // 2. 과거 Labor 레코드에서 최근 단가 참조
  const recentLabors = await prisma.labor.findMany({
    where: { name: { contains: q, mode: 'insensitive' } },
    select: { workerId: true, name: true, jobType: true, unitPrice: true },
    orderBy: { id: 'desc' },
    take: 20,
  })

  const priceMap = new Map<string, number>()
  for (const l of recentLabors) {
    const key = l.workerId || l.name
    if (!priceMap.has(key)) priceMap.set(key, l.unitPrice)
  }

  const results: Array<{ workerId?: string; name: string; jobType: string; unitPrice: number; birthYYMMDD?: string }> = []
  const seen = new Set<string>()

  // 마스터 등록 인원 먼저 추가 (동명이인 구분을 위해 birthYYMMDD 표기)
  for (const w of masterWorkers) {
    seen.add(w.name)
    results.push({
      workerId: w.id,
      name: w.name,
      jobType: w.jobType || '보통인부',
      unitPrice: priceMap.get(w.id) || priceMap.get(w.name) || 160000,
      birthYYMMDD: w.birthYYMMDD || undefined,
    })
  }

  // 과거 일보에만 있고 마스터에 없는 인원 보충
  for (const l of recentLabors) {
    if (!seen.has(l.name)) {
      seen.add(l.name)
      results.push({
        workerId: l.workerId || undefined,
        name: l.name,
        jobType: l.jobType,
        unitPrice: l.unitPrice,
      })
    }
  }

  return results.slice(0, 8)
}

export async function searchEquipments(query: string) {
  await requireUser()
  if (!query || query.length < 1) return []
  const data = await prisma.equipment.findMany({
    where: { name: { contains: query, mode: 'insensitive' } },
    select: { name: true, spec: true, unitPrice: true }, take: 20,
  })
  const seen = new Set<string>()
  return data.filter(r => { if (seen.has(r.name)) return false; seen.add(r.name); return true }).slice(0, 5)
}

export async function searchMaterials(query: string) {
  await requireUser()
  if (!query || query.length < 1) return []
  const data = await prisma.material.findMany({
    where: { name: { contains: query, mode: 'insensitive' } },
    select: { name: true, spec: true, unit: true }, take: 20,
  })
  const seen = new Set<string>()
  return data.filter(r => { if (seen.has(r.name)) return false; seen.add(r.name); return true }).slice(0, 5)
}

export async function searchOutsourcings(query: string) {
  await requireUser()
  if (!query || query.length < 1) return []
  const data = await prisma.outsourcing.findMany({
    where: { companyName: { contains: query, mode: 'insensitive' } },
    select: { companyName: true, task: true }, take: 20,
  })
  const seen = new Set<string>()
  return data.filter(r => { if (seen.has(r.companyName)) return false; seen.add(r.companyName); return true }).slice(0, 5)
}

