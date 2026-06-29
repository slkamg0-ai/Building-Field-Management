'use server'

import prisma from './prisma'
import { GoogleGenAI } from '@google/genai'
import { revalidatePath } from 'next/cache'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { clearSession, createSession, getSessionUser, hashPin, requireAdmin, requireUser, verifyPin } from './auth'
import {
  appendSheetValues,
  createDriveFolder,
  createSpreadsheet,
  downloadDriveFile,
  findDriveFolderByName,
  exportSpreadsheetPdf,
  formatMonthlyBillingSheet,
  listDriveFolderFiles,
  moveDriveFileToFolder,
  readSheetValues,
  rowsToObjects,
  uploadPdfToDrive,
  writeSheetValues,
} from './googleSheets'

function publicUser(user: { id: string; name: string; role: string; isActive?: boolean }) {
  return { id: user.id, name: user.name, role: user.role, isActive: user.isActive }
}

function docStatusFromText(value?: string | null) {
  const text = value || ''
  if (text.includes('완비')) return 'COMPLETE'
  if (text.includes('검토')) return 'REVIEW'
  if (text.includes('미비')) return 'INCOMPLETE'
  return 'UNKNOWN'
}

function parseMoney(value: unknown) {
  if (typeof value === 'number') return value
  const cleaned = String(value ?? '').replace(/[^\d.-]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseAmount(value: unknown) {
  if (typeof value === 'number') return value
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function ymd(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function documentStatusLabel(status?: string | null) {
  switch (status) {
    case 'COMPLETE':
      return '3종완비'
    case 'REVIEW':
      return '검토필요'
    case 'INCOMPLETE':
      return '미비'
    case 'UNREGISTERED':
      return '미등록'
    default:
      return '확인필요'
  }
}

function monthlyBillingRows(args: {
  siteName: string
  year: number
  month: number
  totalLaborCost: number
  workerCount: number
  readyWorkerCount: number
  holdWorkerCount: number
  items: any[]
}) {
  const title = `월별 노무 투입명세 (${args.year}-${String(args.month).padStart(2, '0')})`
  return [
    [title],
    ['현장명', args.siteName, '작성일', ymd(new Date())],
    ['총 인원', `${args.workerCount}명`, '총 노무비', args.totalLaborCost],
    ['지급가능', `${args.readyWorkerCount}명`, '보류', `${args.holdWorkerCount}명`],
    [],
    ['번호', '성명', '생년월일', '공종', '공수', '단가', '금액', '은행', '계좌번호', '서류상태', '지급가능', '증빙폴더', '비고'],
    ...args.items.map((item, index) => [
      index + 1,
      item.name,
      item.birthYYMMDD || '',
      item.jobType,
      item.amount,
      item.unitPrice,
      item.totalPrice,
      item.bankName || '',
      item.accountNumber || '',
      documentStatusLabel(item.documentStatus),
      item.documentStatus === 'COMPLETE' ? '가능' : '보류',
      item.driveFolderUrl || '',
      item.note || '',
    ]),
    ['합계', '', '', '', '', '', args.totalLaborCost],
  ]
}

// ════════════════════════════════════════════════════════════════
//  현장 관리
// ════════════════════════════════════════════════════════════════
export async function getSites() {
  return prisma.site.findMany({ orderBy: { createdAt: 'desc' } })
}

export async function createSite(name: string, contractAmount: number, startDate: string, endDate: string) {
  await requireAdmin()
  const data = await prisma.site.create({
    data: { name, contractAmount, startDate: new Date(startDate), endDate: new Date(endDate) },
  })
  revalidatePath('/')
  return data
}

export async function updateSite(id: string, name: string, contractAmount: number, startDate: string, endDate: string) {
  await requireAdmin()
  const data = await prisma.site.update({
    where: { id },
    data: { name, contractAmount, startDate: new Date(startDate), endDate: new Date(endDate) },
  })
  revalidatePath('/')
  return data
}

export async function resetSiteData(siteId: string) {
  await requireAdmin()
  await prisma.dailyLog.deleteMany({ where: { siteId } })
  revalidatePath('/')
}

// ════════════════════════════════════════════════════════════════
//  사용자 / 로그인
// ════════════════════════════════════════════════════════════════
export async function login(name: string, pin: string) {
  const user = await prisma.user.findFirst({ where: { name, isActive: true } })
  if (!user) return null

  const hashOk = verifyPin(pin, user.pinHash)
  const legacyOk = !hashOk && user.pin && user.pin === pin
  if (!hashOk && !legacyOk) return null

  if (legacyOk || !user.pinHash) {
    await prisma.user.update({
      where: { id: user.id },
      data: { pinHash: hashPin(pin), pin: '' },
    })
  }

  const sessionUser = { id: user.id, name: user.name, role: user.role }
  await createSession(sessionUser)
  return sessionUser
}

export async function logout() {
  await clearSession()
}

export async function getCurrentUser() {
  return getSessionUser()
}

export async function getLoginStatus() {
  const userCount = await prisma.user.count()
  return { needsBootstrap: userCount === 0 }
}

export async function bootstrapAdmin(name: string, pin: string) {
  const count = await prisma.user.count()
  if (count > 0) throw new Error('이미 사용자가 등록되어 있습니다.')
  if (!name.trim() || !/^\d{4,8}$/.test(pin)) throw new Error('이름과 4~8자리 숫자 PIN을 입력해 주세요.')
  const admin = await prisma.user.create({
    data: { name: name.trim(), pin: '', pinHash: hashPin(pin), role: 'ADMIN' },
  })
  const sessionUser = { id: admin.id, name: admin.name, role: admin.role }
  await createSession(sessionUser)
  return sessionUser
}

export async function getUsers() {
  await requireUser()
  const users = await prisma.user.findMany({ orderBy: { name: 'asc' } })
  return users.map(publicUser)
}

export async function createUser(name: string, pin: string, role: string = 'WORKER') {
  await requireAdmin()
  if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN은 4~8자리 숫자로 입력해 주세요.')
  const safeRole = role === 'ADMIN' ? 'ADMIN' : 'WORKER'
  const data = await prisma.user.create({ data: { name, pin: '', pinHash: hashPin(pin), role: safeRole } })
  revalidatePath('/')
  return publicUser(data)
}

export async function deleteUser(id: string) {
  const admin = await requireAdmin()
  if (admin.id === id) throw new Error('현재 로그인한 관리자는 삭제할 수 없습니다.')
  await prisma.user.delete({ where: { id } })
  revalidatePath('/')
}

export async function updateUserRole(id: string, role: string) {
  const admin = await requireAdmin()
  if (admin.id === id && role !== 'ADMIN') throw new Error('현재 로그인한 관리자의 권한은 낮출 수 없습니다.')
  const safeRole = role === 'ADMIN' ? 'ADMIN' : 'WORKER'
  await prisma.user.update({ where: { id }, data: { role: safeRole } })
  revalidatePath('/')
}

export async function updateUserPin(id: string, newPin: string) {
  await requireAdmin()
  if (!/^\d{4,8}$/.test(newPin)) throw new Error('PIN은 4~8자리 숫자로 입력해 주세요.')
  await prisma.user.update({ where: { id }, data: { pin: '', pinHash: hashPin(newPin) } })
  revalidatePath('/')
}

export async function toggleUserActive(id: string, isActive: boolean) {
  const admin = await requireAdmin()
  if (admin.id === id && !isActive) throw new Error('현재 로그인한 관리자는 비활성화할 수 없습니다.')
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
  const user = await requireUser()
  await prisma.labor.create({ data: {
    logId, name: data.name, jobType: data.jobType,
    unitPrice: parseInt(data.unitPrice), amount: parseFloat(data.amount),
    totalPrice: parseInt(data.unitPrice) * parseFloat(data.amount),
    note: data.note || null, createdBy: user.name,
  } })
  revalidatePath('/')
}

export async function addEquipment(logId: string, data: any, creatorName: string) {
  const user = await requireUser()
  await prisma.equipment.create({ data: {
    logId, name: data.name, spec: data.spec || null,
    unitPrice: parseInt(data.unitPrice), amount: parseFloat(data.amount),
    totalPrice: parseInt(data.unitPrice) * parseFloat(data.amount),
    note: data.note || null, createdBy: user.name,
  } })
  revalidatePath('/')
}

export async function addMaterial(logId: string, data: any, creatorName: string) {
  const user = await requireUser()
  await prisma.material.create({ data: {
    logId, name: data.name, spec: data.spec || null, unit: data.unit,
    quantity: parseFloat(data.quantity), note: data.note || null, createdBy: user.name,
  } })
  revalidatePath('/')
}

export async function addExpense(logId: string, data: any, creatorName: string) {
  const user = await requireUser()
  await prisma.expense.create({ data: {
    logId, category: data.category, amount: parseInt(data.amount),
    note: data.note || null, createdBy: user.name,
    assignedTo: data.assignedTo || user.name,
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
  await requireAdmin()
  await prisma.expense.updateMany({ where: { id: { in: expenseIds } }, data: { isSettled: true, settledAt: new Date() } })
  revalidatePath('/')
}

export async function addOutsourcing(logId: string, data: any, creatorName: string) {
  const user = await requireUser()
  await prisma.outsourcing.create({ data: {
    logId, companyName: data.company, task: data.task,
    amount: parseInt(data.amount), note: data.note || null, createdBy: user.name,
  } })
  revalidatePath('/')
}

export async function updateDailyLogDescription(logId: string, description: string) {
  await requireUser()
  await prisma.dailyLog.update({ where: { id: logId }, data: { description } })
  revalidatePath('/')
}

export async function addPhotoRecord(logId: string, url: string, creatorName: string) {
  const user = await requireUser()
  await prisma.photo.create({ data: { logId, url, createdBy: user.name } })
  revalidatePath('/')
}

export async function deletePhoto(photoId: string) {
  await requireUser()
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
  const user = await requireUser()
  const url = await saveImageToLocal(dataUrl, logId)
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
  await requireAdmin()
  const row = await prisma.worker.create({ data: {
    name: data.name,
    phone: data.phone || null,
    company: data.company || null,
    jobType: data.jobType || null,
    birthDate: data.birthDate ? new Date(data.birthDate) : null,
    birthYYMMDD: data.birthYYMMDD || null,
    gender: data.gender || null,
    safetyEduDate: data.safetyEduDate ? new Date(data.safetyEduDate) : null,
    safetyEduNumber: data.safetyEduNumber || null,
    basicSafetyEdu: !!data.basicSafetyEdu,
    bankName: data.bankName || null,
    accountNumber: data.accountNumber || null,
    documentStatus: data.documentStatus || 'UNKNOWN',
    driveFolderUrl: data.driveFolderUrl || null,
    photoUrl: data.photoUrl || null,
    faceDescriptor: data.faceDescriptor ?? undefined,
    isActive: true,
  } })
  revalidatePath('/workers')
  return row
}

export async function updateWorker(id: string, data: any) {
  await requireAdmin()
  const patch: any = {}
  for (const f of [
    'name', 'phone', 'company', 'jobType', 'birthYYMMDD', 'gender', 'photoUrl',
    'isActive', 'basicSafetyEdu', 'safetyEduNumber', 'bankName', 'accountNumber',
    'documentStatus', 'driveFolderUrl',
  ]) {
    if (data[f] !== undefined) patch[f] = data[f]
  }
  if (data.birthDate !== undefined) patch.birthDate = data.birthDate ? new Date(data.birthDate) : null
  if (data.safetyEduDate !== undefined) patch.safetyEduDate = data.safetyEduDate ? new Date(data.safetyEduDate) : null
  if (data.faceDescriptor !== undefined) patch.faceDescriptor = data.faceDescriptor
  await prisma.worker.update({ where: { id }, data: patch })
  revalidatePath('/workers')
}

export async function deleteWorker(id: string) {
  await requireAdmin()
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
  await requireAdmin()
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

type WorkerDocumentAnalysis = {
  workerName?: string
  birthYYMMDD?: string
  documentTypes?: string[]
  idType?: string
  bankName?: string
  accountNumber?: string
  safetyEduNumber?: string
  safetyEduComplete?: boolean
  confidence?: number
  needsReview?: boolean
  notes?: string
}

const WORKER_DOCUMENT_PROMPT = `이 이미지는 건설현장 근로자 등록 서류입니다.
한 장에 신분증/운전면허증/통장사본/건설업 기초안전보건교육 이수증이 함께 있거나 일부만 있을 수 있습니다.
반드시 JSON 하나로만 응답하세요. 모르는 값은 빈 문자열, 확실하지 않은 값은 notes에 이유를 적고 needsReview=true로 두세요.
주민등록번호는 전체를 쓰지 말고 생년월일 앞 6자리만 birthYYMMDD에 쓰세요.
계좌번호는 보이는 그대로 적되 공백은 제거하고 하이픈은 유지하세요.
documentTypes는 다음 값 중 해당하는 것을 배열로 쓰세요: ID_CARD, DRIVER_LICENSE, BANKBOOK, SAFETY_EDU, OTHER.
{
  "workerName": "근로자 이름",
  "birthYYMMDD": "생년월일 6자리",
  "documentTypes": ["ID_CARD"],
  "idType": "주민등록증 또는 운전면허증",
  "bankName": "은행명",
  "accountNumber": "계좌번호",
  "safetyEduNumber": "안전교육 이수번호",
  "safetyEduComplete": true,
  "confidence": 0.0,
  "needsReview": true,
  "notes": "검토 사유"
}`

function parseJsonObject(text: string) {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('AI 응답에서 JSON을 찾지 못했습니다.')
  return JSON.parse(match[0])
}

function imageDimensions(buffer: Buffer, mimeType: string) {
  if (mimeType === 'image/png' && buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }

  if (mimeType === 'image/jpeg') {
    let offset = 2
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) break
      const marker = buffer[offset + 1]
      const length = buffer.readUInt16BE(offset + 2)
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
      }
      offset += 2 + length
    }
  }

  return { width: 0, height: 0 }
}

function documentTypesFromAnalysis(analysis: WorkerDocumentAnalysis) {
  const allowed = new Set(['ID_CARD', 'DRIVER_LICENSE', 'BANKBOOK', 'SAFETY_EDU', 'OTHER'])
  const types = (analysis.documentTypes || []).filter(type => allowed.has(type))
  if (analysis.idType && !types.includes('ID_CARD') && !types.includes('DRIVER_LICENSE')) types.push('ID_CARD')
  if ((analysis.bankName || analysis.accountNumber) && !types.includes('BANKBOOK')) types.push('BANKBOOK')
  if ((analysis.safetyEduNumber || analysis.safetyEduComplete) && !types.includes('SAFETY_EDU')) types.push('SAFETY_EDU')
  return types.length ? types : ['OTHER']
}

function workerDocumentStatus(analysis: WorkerDocumentAnalysis, qualityNeedsReview: boolean) {
  const types = documentTypesFromAnalysis(analysis)
  const hasId = types.some(type => type === 'ID_CARD' || type === 'DRIVER_LICENSE') && !!analysis.birthYYMMDD
  const hasBank = !!analysis.bankName && !!analysis.accountNumber
  const hasSafety = !!analysis.safetyEduNumber || analysis.safetyEduComplete === true
  if (hasId && hasBank && hasSafety && !analysis.needsReview && !qualityNeedsReview) return 'COMPLETE'
  if (hasId || hasBank || hasSafety) return 'REVIEW'
  return 'INCOMPLETE'
}

function safeDriveFolderName(name: string, birthYYMMDD?: string | null) {
  const suffix = birthYYMMDD || '생년미상'
  return `${name}_${suffix}`.replace(/[\\/:*?"<>|]/g, '_')
}

async function appendWorkerDocumentLog(row: unknown[]) {
  const spreadsheetId = process.env.GOOGLE_WORKER_MASTER_SPREADSHEET_ID
  if (!spreadsheetId) return
  await appendSheetValues(spreadsheetId, '서류로그', [row])
}

async function analyzeWorkerDocumentImage(buffer: Buffer, mimeType: string) {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) throw new Error('GOOGLE_GEMINI_API_KEY 또는 GOOGLE_GENERATIVE_AI_API_KEY가 설정되지 않았습니다.')
  const ai = new GoogleGenAI({ apiKey })
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { data: buffer.toString('base64'), mimeType } },
          { text: WORKER_DOCUMENT_PROMPT },
        ],
      },
    ],
  })
  return parseJsonObject(response.text ?? '') as WorkerDocumentAnalysis
}

// ════════════════════════════════════════════════════════════════
//  Google Drive 노무관리 연계
// ════════════════════════════════════════════════════════════════
export async function syncWorkersFromDriveMaster(rows: Array<Record<string, any>>, sourceUrl?: string) {
  const user = await requireAdmin()
  const job = await prisma.driveSyncJob.create({
    data: {
      type: 'WORKER_MASTER_IMPORT',
      status: 'RUNNING',
      sourceUrl: sourceUrl || null,
      startedAt: new Date(),
      createdBy: user.name,
    },
  })

  let created = 0
  let updated = 0
  let skipped = 0

  try {
    for (const row of rows) {
      const name = String(row['근로자명'] || row['성명'] || '').trim()
      const birthYYMMDD = String(row['생년월일'] || '').replace(/[^\d]/g, '').slice(0, 6)
      if (!name) {
        skipped++
        continue
      }

      const patch = {
        name,
        birthYYMMDD: birthYYMMDD || null,
        bankName: row['은행명'] || null,
        accountNumber: row['계좌번호'] || null,
        safetyEduNumber: row['안전교육번호'] || null,
        basicSafetyEdu: String(row['안전교육'] || '').includes('이수'),
        documentStatus: docStatusFromText(row['서류완비']),
        driveFolderUrl: row['폴더링크'] || null,
      }

      const existing = await prisma.worker.findFirst({
        where: birthYYMMDD ? { name, birthYYMMDD } : { name },
      })

      if (existing) {
        await prisma.worker.update({ where: { id: existing.id }, data: patch })
        updated++
      } else {
        await prisma.worker.create({ data: patch })
        created++
      }
    }

    const result = { created, updated, skipped, total: rows.length }
    await prisma.driveSyncJob.update({
      where: { id: job.id },
      data: { status: 'SUCCESS', finishedAt: new Date(), result },
    })
    revalidatePath('/workers')
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await prisma.driveSyncJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', finishedAt: new Date(), error: message },
    })
    throw err
  }
}

export async function syncWorkersFromConfiguredDriveMaster() {
  await requireAdmin()
  const spreadsheetId = process.env.GOOGLE_WORKER_MASTER_SPREADSHEET_ID
  const sheetName = process.env.GOOGLE_WORKER_MASTER_SHEET_NAME || '근로자마스터'
  if (!spreadsheetId) throw new Error('GOOGLE_WORKER_MASTER_SPREADSHEET_ID가 설정되지 않았습니다.')

  const values = await readSheetValues(spreadsheetId, sheetName, 'A1:L1000')
  const rows = rowsToObjects(values)
  return syncWorkersFromDriveMaster(
    rows,
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`,
  )
}

export async function processPendingWorkerDocuments(limit: number = 10) {
  const user = await requireAdmin()
  const pendingFolderId = process.env.GOOGLE_WORKER_DOC_PENDING_FOLDER_ID
  const completedFolderId = process.env.GOOGLE_WORKER_DOC_COMPLETED_FOLDER_ID
  const failedFolderId = process.env.GOOGLE_WORKER_DOC_FAILED_FOLDER_ID

  if (!pendingFolderId) throw new Error('GOOGLE_WORKER_DOC_PENDING_FOLDER_ID가 설정되지 않았습니다.')
  if (!completedFolderId) throw new Error('GOOGLE_WORKER_DOC_COMPLETED_FOLDER_ID가 설정되지 않았습니다.')
  if (!failedFolderId) throw new Error('GOOGLE_WORKER_DOC_FAILED_FOLDER_ID가 설정되지 않았습니다.')

  const job = await prisma.driveSyncJob.create({
    data: {
      type: 'DOCUMENT_SCAN',
      status: 'RUNNING',
      sourceUrl: `https://drive.google.com/drive/folders/${pendingFolderId}`,
      startedAt: new Date(),
      createdBy: user.name,
    },
  })

  let processed = 0
  let completed = 0
  let review = 0
  let failed = 0
  const details: any[] = []

  try {
    const files = (await listDriveFolderFiles(pendingFolderId, Math.min(Math.max(limit, 1), 50)))
      .filter(file => ['image/jpeg', 'image/png'].includes(file.mimeType))

    for (const file of files) {
      processed++
      const sourceUrl = file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`

      try {
        const buffer = await downloadDriveFile(file.id)
        const dimensions = imageDimensions(buffer, file.mimeType)
        const qualityNeedsReview = buffer.length < 250_000 || dimensions.width < 1600 || dimensions.height < 900
        const analysis = await analyzeWorkerDocumentImage(buffer, file.mimeType)
        const workerName = String(analysis.workerName || '').trim()
        const birthYYMMDD = String(analysis.birthYYMMDD || '').replace(/[^\d]/g, '').slice(0, 6)
        const status = workerDocumentStatus({ ...analysis, birthYYMMDD }, qualityNeedsReview)
        const noteParts = [
          analysis.notes || '',
          qualityNeedsReview ? `이미지 품질 검토 필요(${dimensions.width}x${dimensions.height}, ${buffer.length} bytes)` : '',
        ].filter(Boolean)
        const note = noteParts.join(' / ')

        if (!workerName) {
          const moved = await moveDriveFileToFolder(file.id, failedFolderId, pendingFolderId)
          failed++
          await appendWorkerDocumentLog([
            ymd(new Date()),
            '',
            birthYYMMDD,
            '',
            JSON.stringify(analysis),
            file.name,
            `https://drive.google.com/drive/folders/${failedFolderId}`,
            file.id,
            '검토필요',
            note || '근로자명 판독 실패',
          ])
          details.push({ fileName: file.name, status: 'FAILED', reason: '근로자명 판독 실패', parents: moved?.parents })
          continue
        }

        const folderName = safeDriveFolderName(workerName, birthYYMMDD)
        const workerFolder = await findDriveFolderByName(completedFolderId, folderName)
          || await createDriveFolder(folderName, completedFolderId)
        const moved = await moveDriveFileToFolder(file.id, workerFolder.id, pendingFolderId)
        const driveFileUrl = sourceUrl
        const driveFolderUrl = workerFolder.url
        const existing = await prisma.worker.findFirst({
          where: birthYYMMDD ? { name: workerName, birthYYMMDD } : { name: workerName },
        })
        const nextWorkerStatus = status === 'COMPLETE'
          ? 'COMPLETE'
          : existing?.documentStatus === 'COMPLETE'
            ? 'COMPLETE'
            : status
        const workerPatch = {
          name: workerName,
          birthYYMMDD: birthYYMMDD || null,
          bankName: analysis.bankName || existing?.bankName || null,
          accountNumber: analysis.accountNumber || existing?.accountNumber || null,
          safetyEduNumber: analysis.safetyEduNumber || existing?.safetyEduNumber || null,
          basicSafetyEdu: analysis.safetyEduComplete === true || existing?.basicSafetyEdu || !!analysis.safetyEduNumber,
          documentStatus: nextWorkerStatus,
          driveFolderUrl,
        }
        const worker = existing
          ? await prisma.worker.update({ where: { id: existing.id }, data: workerPatch })
          : await prisma.worker.create({ data: workerPatch })

        const documentTypes = documentTypesFromAnalysis(analysis)
        for (const documentType of documentTypes) {
          await prisma.workerDocument.create({
            data: {
              workerId: worker.id,
              workerName,
              birthYYMMDD: birthYYMMDD || null,
              documentType,
              driveFileId: file.id,
              driveFileUrl,
              driveFolderUrl,
              sourceFileName: file.name,
              extractedData: analysis as any,
              confidence: typeof analysis.confidence === 'number' ? analysis.confidence : null,
              status: status === 'COMPLETE' ? 'SUCCESS' : 'REVIEW',
              note,
            },
          })
          await appendWorkerDocumentLog([
            ymd(new Date()),
            workerName,
            birthYYMMDD,
            documentType,
            JSON.stringify(analysis),
            file.name,
            driveFolderUrl,
            file.id,
            status === 'COMPLETE' ? '성공' : '검토필요',
            note,
          ])
        }

        if (status === 'COMPLETE') completed++
        else review++
        details.push({ fileName: file.name, workerName, birthYYMMDD, status, documentTypes, parents: moved?.parents })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const moved = await moveDriveFileToFolder(file.id, failedFolderId, pendingFolderId)
        failed++
        await prisma.workerDocument.create({
          data: {
            documentType: 'OTHER',
            driveFileId: file.id,
            driveFileUrl: sourceUrl,
            driveFolderUrl: `https://drive.google.com/drive/folders/${failedFolderId}`,
            sourceFileName: file.name,
            status: 'FAILED',
            note: message,
          },
        })
        await appendWorkerDocumentLog([
          ymd(new Date()),
          '',
          '',
          '',
          '',
          file.name,
          `https://drive.google.com/drive/folders/${failedFolderId}`,
          file.id,
          '실패',
          message,
        ])
        details.push({ fileName: file.name, status: 'FAILED', reason: message, parents: moved?.parents })
      }
    }

    const result = { processed, completed, review, failed, details }
    await prisma.driveSyncJob.update({
      where: { id: job.id },
      data: {
        status: 'SUCCESS',
        targetUrl: `https://drive.google.com/drive/folders/${completedFolderId}`,
        finishedAt: new Date(),
        result,
      },
    })
    revalidatePath('/')
    revalidatePath('/workers')
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await prisma.driveSyncJob.update({
      where: { id: job.id },
      data: { status: 'FAILED', finishedAt: new Date(), error: message },
    })
    throw err
  }
}

export async function getDriveSyncJobs(limit: number = 20) {
  await requireAdmin()
  return prisma.driveSyncJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
  })
}

export async function generateMonthlyLaborBilling(siteId: string, year: number, month: number) {
  const user = await requireAdmin()
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59)
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) throw new Error('현장을 찾을 수 없습니다.')

  const logs = await prisma.dailyLog.findMany({
    where: { siteId, date: { gte: start, lte: end } },
    include: { labors: true },
    orderBy: { date: 'asc' },
  })

  const workers = await prisma.worker.findMany()
  const workerByName = new Map(workers.map(w => [w.name, w]))
  const groups = new Map<string, any>()

  for (const log of logs) {
    for (const labor of log.labors) {
      const key = `${labor.name}::${labor.jobType}::${labor.unitPrice}`
      const worker = workerByName.get(labor.name)
      const current = groups.get(key) || {
        name: labor.name,
        birthYYMMDD: worker?.birthYYMMDD || null,
        jobType: labor.jobType,
        amount: 0,
        unitPrice: labor.unitPrice,
        totalPrice: 0,
        bankName: worker?.bankName || null,
        accountNumber: worker?.accountNumber || null,
        documentStatus: worker?.documentStatus || 'UNREGISTERED',
        driveFolderUrl: worker?.driveFolderUrl || null,
        note: worker ? '' : '근로자마스터 미등록',
      }
      current.amount += parseAmount(labor.amount)
      current.totalPrice += parseMoney(labor.totalPrice)
      groups.set(key, current)
    }
  }

  const items = Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const totalLaborCost = items.reduce((sum, item) => sum + item.totalPrice, 0)
  const totalLaborAmount = items.reduce((sum, item) => sum + item.amount, 0)
  const readyWorkerCount = items.filter(item => item.documentStatus === 'COMPLETE').length
  const holdWorkerCount = items.length - readyWorkerCount

  const billing = await prisma.monthlyBilling.upsert({
    where: { siteId_year_month: { siteId, year, month } },
    update: {
      totalLaborCost,
      totalLaborAmount,
      workerCount: items.length,
      readyWorkerCount,
      holdWorkerCount,
      summary: { siteName: site.name, items },
      createdBy: user.name,
      status: 'DRAFT',
    },
    create: {
      siteId,
      year,
      month,
      totalLaborCost,
      totalLaborAmount,
      workerCount: items.length,
      readyWorkerCount,
      holdWorkerCount,
      summary: { siteName: site.name, items },
      createdBy: user.name,
      status: 'DRAFT',
    },
  })

  return { billing, items }
}

export async function exportMonthlyLaborBillingToDrive(siteId: string, year: number, month: number) {
  const user = await requireAdmin()
  const outputFolderId = process.env.GOOGLE_BILLING_OUTPUT_FOLDER_ID
  if (!outputFolderId) throw new Error('GOOGLE_BILLING_OUTPUT_FOLDER_ID가 설정되지 않았습니다.')

  const { billing, items } = await generateMonthlyLaborBilling(siteId, year, month)
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) throw new Error('현장을 찾을 수 없습니다.')

  const ym = `${year}-${String(month).padStart(2, '0')}`
  const safeSiteName = site.name.replace(/[\\/:*?"<>|]/g, '_')
  const title = `${safeSiteName}_월별노무투입명세_${ym}`
  const sheetName = '월별투입명세'

  const spreadsheet = await createSpreadsheet(title, sheetName)
  await moveDriveFileToFolder(spreadsheet.id, outputFolderId)

  const rows = monthlyBillingRows({
    siteName: site.name,
    year,
    month,
    totalLaborCost: billing.totalLaborCost,
    workerCount: billing.workerCount,
    readyWorkerCount: billing.readyWorkerCount,
    holdWorkerCount: billing.holdWorkerCount,
    items,
  })
  await writeSheetValues(spreadsheet.id, sheetName, rows)
  await formatMonthlyBillingSheet(spreadsheet.id, spreadsheet.sheetId, rows.length)

  const pdf = await exportSpreadsheetPdf(spreadsheet.id)
  const pdfFile = await uploadPdfToDrive(`${title}.pdf`, pdf, outputFolderId)

  const updated = await prisma.monthlyBilling.update({
    where: { id: billing.id },
    data: {
      sheetUrl: spreadsheet.url,
      pdfUrl: pdfFile.url,
      status: 'EXPORTED',
      createdBy: user.name,
    },
  })

  await prisma.driveSyncJob.create({
    data: {
      type: 'BILLING_EXPORT',
      status: 'SUCCESS',
      sourceUrl: spreadsheet.url,
      targetUrl: pdfFile.url,
      startedAt: new Date(),
      finishedAt: new Date(),
      createdBy: user.name,
      result: { billingId: billing.id, spreadsheetUrl: spreadsheet.url, pdfUrl: pdfFile.url },
    },
  })

  return { billing: updated, items, spreadsheetUrl: spreadsheet.url, pdfUrl: pdfFile.url }
}
