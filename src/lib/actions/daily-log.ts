'use server'

import prisma from '../prisma'
import { revalidatePath } from 'next/cache'
import { uploadDataUrlToR2, deleteFromR2 } from '../r2'
import { requireAdmin, requireSiteAccess, requireUser } from '../auth'
import { requireLogSiteAccess, requireRecordSiteAccess } from './_shared'

// ════════════════════════════════════════════════════════════════
//  일일 로그
// ════════════════════════════════════════════════════════════════
export async function getDailyLog(dateString: string, siteId: string) {
  await requireSiteAccess(siteId)
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
  const { user } = await requireLogSiteAccess(logId)
  await prisma.labor.create({ data: {
    logId, name: data.name, jobType: data.jobType,
    unitPrice: parseInt(data.unitPrice), amount: parseFloat(data.amount),
    totalPrice: parseInt(data.unitPrice) * parseFloat(data.amount),
    note: data.note || null, createdBy: user.name,
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

