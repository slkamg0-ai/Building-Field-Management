'use server'

import { supabase } from './supabase'
import { revalidatePath } from 'next/cache'

function newId(): string {
  return crypto.randomUUID()
}

// 현장 관리
export async function getSites() {
  const { data, error } = await supabase
    .from('Site')
    .select('*')
    .order('createdAt', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

export async function createSite(name: string, contractAmount: number, startDate: string, endDate: string) {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('Site')
    .insert({
      id: newId(),
      name,
      contractAmount,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
      updatedAt: now,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/')
  return data
}

export async function updateSite(id: string, name: string, contractAmount: number, startDate: string, endDate: string) {
  const { data, error } = await supabase
    .from('Site')
    .update({
      name,
      contractAmount,
      startDate: new Date(startDate).toISOString(),
      endDate: new Date(endDate).toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/')
  return data
}

export async function resetSiteData(siteId: string) {
  const { error } = await supabase
    .from('DailyLog')
    .delete()
    .eq('siteId', siteId)
  if (error) throw new Error(error.message)
  revalidatePath('/')
}

// 사용자 관리 및 로그인
export async function login(name: string, pin: string) {
  const { data: user, error } = await supabase
    .from('User')
    .select('*')
    .eq('name', name)
    .eq('isActive', true)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (user && user.pin === pin) {
    return { id: user.id, name: user.name, role: user.role }
  }
  return null
}

export async function getUsers() {
  const { data: users, error } = await supabase
    .from('User')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)

  if (!users || users.length === 0) {
    const { data: admin, error: createError } = await supabase
      .from('User')
      .insert({ id: newId(), name: '관리자', pin: '0000', role: 'ADMIN' })
      .select()
      .single()
    if (createError) throw new Error(createError.message)
    return [admin]
  }

  return users
}

export async function createUser(name: string, pin: string, role: string = 'WORKER') {
  const { data, error } = await supabase
    .from('User')
    .insert({ id: newId(), name, pin, role })
    .select()
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/')
  return data
}

export async function deleteUser(id: string) {
  const { error } = await supabase
    .from('User')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/')
}

export async function updateUserRole(id: string, role: string) {
  const { error } = await supabase
    .from('User')
    .update({ role })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/')
}

export async function updateUserPin(id: string, newPin: string) {
  const { error } = await supabase
    .from('User')
    .update({ pin: newPin })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/')
}

export async function toggleUserActive(id: string, isActive: boolean) {
  const { error } = await supabase
    .from('User')
    .update({ isActive })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/')
}

// 일일 로그
export async function getDailyLog(dateString: string, siteId: string) {
  const startOfDay = new Date(dateString)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(dateString)
  endOfDay.setHours(23, 59, 59, 999)

  const { data: log, error } = await supabase
    .from('DailyLog')
    .select('*, Labor(*), Equipment(*), Material(*), Expense(*), Outsourcing(*), Photo(*)')
    .eq('siteId', siteId)
    .gte('date', startOfDay.toISOString())
    .lte('date', endOfDay.toISOString())
    .maybeSingle()

  if (error) throw new Error(error.message)

  if (log) {
    return normalizeLog(log)
  }

  const now = new Date().toISOString()
  const { data: newLog, error: createError } = await supabase
    .from('DailyLog')
    .insert({ id: newId(), siteId, date: startOfDay.toISOString(), updatedAt: now })
    .select()
    .single()
  if (createError) throw new Error(createError.message)

  return { ...newLog, labors: [], equipments: [], materials: [], expenses: [], outsourcings: [], photos: [] }
}

function normalizeLog(log: any) {
  return {
    ...log,
    labors: log.Labor || [],
    equipments: log.Equipment || [],
    materials: log.Material || [],
    expenses: log.Expense || [],
    outsourcings: log.Outsourcing || [],
    photos: log.Photo || [],
  }
}

// 노무 추가
export async function addLabor(logId: string, data: any, creatorName: string) {
  const { error } = await supabase.from('Labor').insert({
    id: newId(),
    logId,
    name: data.name,
    jobType: data.jobType,
    unitPrice: parseInt(data.unitPrice),
    amount: parseFloat(data.amount),
    totalPrice: parseInt(data.unitPrice) * parseFloat(data.amount),
    note: data.note || null,
    createdBy: creatorName,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/')
}

// 장비 추가
export async function addEquipment(logId: string, data: any, creatorName: string) {
  const { error } = await supabase.from('Equipment').insert({
    id: newId(),
    logId,
    name: data.name,
    spec: data.spec || null,
    unitPrice: parseInt(data.unitPrice),
    amount: parseFloat(data.amount),
    totalPrice: parseInt(data.unitPrice) * parseFloat(data.amount),
    note: data.note || null,
    createdBy: creatorName,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/')
}

// 자재 추가
export async function addMaterial(logId: string, data: any, creatorName: string) {
  const { error } = await supabase.from('Material').insert({
    id: newId(),
    logId,
    name: data.name,
    spec: data.spec || null,
    unit: data.unit,
    quantity: parseFloat(data.quantity),
    note: data.note || null,
    createdBy: creatorName,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/')
}

// 경비 추가
export async function addExpense(logId: string, data: any, creatorName: string) {
  const { error } = await supabase.from('Expense').insert({
    id: newId(),
    logId,
    category: data.category,
    amount: parseInt(data.amount),
    note: data.note || null,
    createdBy: creatorName,
    assignedTo: data.assignedTo || creatorName,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/')
}

// 월별 담당자별 경비 조회 (정산용)
export async function getMonthlyExpensesByPerson(siteId: string, year: number, month: number) {
  const startOfMonth = new Date(year, month - 1, 1)
  const endOfMonth = new Date(year, month, 0, 23, 59, 59)

  const { data: logs, error: logsError } = await supabase
    .from('DailyLog')
    .select('id')
    .eq('siteId', siteId)
    .gte('date', startOfMonth.toISOString())
    .lte('date', endOfMonth.toISOString())

  if (logsError) throw new Error(logsError.message)
  if (!logs || logs.length === 0) return []
  const logIds = logs.map((l: any) => l.id)

  const { data: expenses, error } = await supabase
    .from('Expense')
    .select('*')
    .in('logId', logIds)

  if (error) throw new Error(error.message)
  if (!expenses || expenses.length === 0) return []

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

// 경비 정산 처리
export async function settleExpenses(expenseIds: string[]) {
  const { error } = await supabase
    .from('Expense')
    .update({ isSettled: true, settledAt: new Date().toISOString() })
    .in('id', expenseIds)
  if (error) throw new Error(error.message)
  revalidatePath('/')
}

// 외주 추가
export async function addOutsourcing(logId: string, data: any, creatorName: string) {
  const { error } = await supabase.from('Outsourcing').insert({
    id: newId(),
    logId,
    companyName: data.company,
    task: data.task,
    amount: parseInt(data.amount),
    note: data.note || null,
    createdBy: creatorName,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/')
}

// 작업 내용 업데이트
export async function updateDailyLogDescription(logId: string, description: string) {
  const { error } = await supabase
    .from('DailyLog')
    .update({ description, updatedAt: new Date().toISOString() })
    .eq('id', logId)
  if (error) throw new Error(error.message)
  revalidatePath('/')
}

// 사진 추가
export async function addPhotoRecord(logId: string, url: string, creatorName: string) {
  const { error } = await supabase.from('Photo').insert({
    id: newId(),
    logId,
    url,
    createdBy: creatorName,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/')
}

// 사진 삭제
export async function deletePhoto(photoId: string) {
  const { error } = await supabase
    .from('Photo')
    .delete()
    .eq('id', photoId)
  if (error) throw new Error(error.message)
  revalidatePath('/')
}

// 자동완성 검색
export async function searchLabors(query: string) {
  if (!query || query.length < 1) return []
  const { data } = await supabase
    .from('Labor')
    .select('name, jobType, unitPrice')
    .ilike('name', `%${query}%`)
    .limit(20)
  if (!data) return []
  const seen = new Set<string>()
  return data.filter(r => { if (seen.has(r.name)) return false; seen.add(r.name); return true }).slice(0, 5)
}

export async function searchEquipments(query: string) {
  if (!query || query.length < 1) return []
  const { data } = await supabase
    .from('Equipment')
    .select('name, spec, unitPrice')
    .ilike('name', `%${query}%`)
    .limit(20)
  if (!data) return []
  const seen = new Set<string>()
  return data.filter(r => { if (seen.has(r.name)) return false; seen.add(r.name); return true }).slice(0, 5)
}

export async function searchMaterials(query: string) {
  if (!query || query.length < 1) return []
  const { data } = await supabase
    .from('Material')
    .select('name, spec, unit')
    .ilike('name', `%${query}%`)
    .limit(20)
  if (!data) return []
  const seen = new Set<string>()
  return data.filter(r => { if (seen.has(r.name)) return false; seen.add(r.name); return true }).slice(0, 5)
}

export async function searchOutsourcings(query: string) {
  if (!query || query.length < 1) return []
  const { data } = await supabase
    .from('Outsourcing')
    .select('companyName, task')
    .ilike('companyName', `%${query}%`)
    .limit(20)
  if (!data) return []
  const seen = new Set<string>()
  return data.filter(r => { if (seen.has(r.companyName)) return false; seen.add(r.companyName); return true }).slice(0, 5)
}

// 월간 통계
export async function getMonthlyStats(siteId: string, dateString: string) {
  const date = new Date(dateString)
  const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1)
  const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59)

  const { data: logs, error } = await supabase
    .from('DailyLog')
    .select('*, Labor(*), Equipment(*), Expense(*), Outsourcing(*)')
    .eq('siteId', siteId)
    .gte('date', startOfMonth.toISOString())
    .lte('date', endOfMonth.toISOString())
    .order('date', { ascending: true })
  if (error) throw new Error(error.message)

  let totalLabor = 0
  let totalEquipment = 0
  let totalExpense = 0
  let totalOutsourcing = 0

  const dailyData = (logs || []).map(log => {
    const labors: any[] = log.Labor || []
    const equipments: any[] = log.Equipment || []
    const expenses: any[] = log.Expense || []
    const outsourcings: any[] = log.Outsourcing || []

    const lPrice = labors.reduce((sum, item) => sum + item.totalPrice, 0)
    const ePrice = equipments.reduce((sum, item) => sum + item.totalPrice, 0)
    const xPrice = expenses.reduce((sum, item) => sum + item.amount, 0)
    const oPrice = outsourcings.reduce((sum, item) => sum + item.amount, 0)

    totalLabor += lPrice
    totalEquipment += ePrice
    totalExpense += xPrice
    totalOutsourcing += oPrice

    return {
      name: new Date(log.date).getDate() + '일',
      노무비: lPrice,
      장비대: ePrice,
      외주비: oPrice,
      경비: xPrice,
      총비용: lPrice + ePrice + oPrice + xPrice,
    }
  })

  return {
    summary: {
      totalLabor,
      totalEquipment,
      totalExpense,
      totalOutsourcing,
      grandTotal: totalLabor + totalEquipment + totalExpense + totalOutsourcing,
    },
    dailyData,
  }
}
dailyData,
    monthlyLogs: (logs || []).map((log: any) => ({
      date: log.date,
      labors: log.Labor || [],
      equipments: log.Equipment || [],
      expenses: log.Expense || [],
      outsourcings: log.Outsourcing || [],
    })),

// 현장 전체 통계
export async function getSiteTotalStats(siteId: string) {
  const { data: site, error: siteError } = await supabase
    .from('Site')
    .select('*')
    .eq('id', siteId)
    .single()
  if (siteError || !site) return null

  const { data: logs, error } = await supabase
    .from('DailyLog')
    .select('*, Labor(*), Equipment(*), Expense(*), Outsourcing(*)')
    .eq('siteId', siteId)
  if (error) throw new Error(error.message)

  let totalLabor = 0
  let totalEquipment = 0
  let totalExpense = 0
  let totalOutsourcing = 0

  ;(logs || []).forEach(log => {
    totalLabor += (log.Labor || []).reduce((sum: number, item: any) => sum + item.totalPrice, 0)
    totalEquipment += (log.Equipment || []).reduce((sum: number, item: any) => sum + item.totalPrice, 0)
    totalExpense += (log.Expense || []).reduce((sum: number, item: any) => sum + item.amount, 0)
    totalOutsourcing += (log.Outsourcing || []).reduce((sum: number, item: any) => sum + item.amount, 0)
  })

  const grandTotal = totalLabor + totalEquipment + totalExpense + totalOutsourcing
  const startDate = new Date(site.startDate)
  const endDate = new Date(site.endDate)
  const totalDays = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))
  const passedDays = Math.max(0, Math.ceil((new Date().getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))
  const dailyLimit = site.contractAmount / totalDays

  return {
    site,
    totalSpent: grandTotal,
    dailyLimit,
    totalDays,
    passedDays,
    progressPercent: site.contractAmount > 0 ? (grandTotal / site.contractAmount) * 100 : 0,
  }
}

// ════════════════════════════════════════════════════════════════
//  근로자(인적사항/신원) + 출퇴근
// ════════════════════════════════════════════════════════════════

export async function getWorkers(includeInactive: boolean = false) {
  let q = supabase.from('Worker').select('*').order('name', { ascending: true })
  if (!includeInactive) q = q.eq('isActive', true)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data || []
}

export async function createWorker(data: any) {
  const now = new Date().toISOString()
  const { data: row, error } = await supabase
    .from('Worker')
    .insert({
      id: newId(),
      name: data.name,
      phone: data.phone || null,
      company: data.company || null,
      jobType: data.jobType || null,
      birthDate: data.birthDate || null,
      gender: data.gender || null,
      safetyEduDate: data.safetyEduDate || null,
      basicSafetyEdu: !!data.basicSafetyEdu,
      photoUrl: data.photoUrl || null,
      faceDescriptor: data.faceDescriptor || null,
      isActive: true,
      updatedAt: now,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  revalidatePath('/workers')
  return row
}

export async function updateWorker(id: string, data: any) {
  const patch: any = { updatedAt: new Date().toISOString() }
  const fields = ['name', 'phone', 'company', 'jobType', 'birthDate', 'gender', 'safetyEduDate', 'basicSafetyEdu', 'photoUrl', 'faceDescriptor', 'isActive']
  for (const f of fields) {
    if (data[f] !== undefined) patch[f] = data[f]
  }
  const { error } = await supabase.from('Worker').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/workers')
}

export async function deleteWorker(id: string) {
  const { error } = await supabase.from('Worker').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/workers')
}

// 출근 처리: 하루 1행. 이미 있으면 그대로 반환.
export async function checkIn(data: {
  workerId: string
  date: string // YYYY-MM-DD
  siteId?: string | null
  siteName?: string | null
  photoUrl?: string | null
  lat?: number | null
  lng?: number | null
  score?: number | null
  verifyStatus?: string
}) {
  // 같은 날 기존 기록 확인
  const { data: existing } = await supabase
    .from('Attendance')
    .select('*')
    .eq('workerId', data.workerId)
    .eq('date', data.date)
    .maybeSingle()

  if (existing && existing.checkInAt) {
    return { record: existing, already: true as const }
  }

  const now = new Date().toISOString()
  if (existing) {
    const { data: row, error } = await supabase
      .from('Attendance')
      .update({
        siteId: data.siteId ?? existing.siteId,
        siteName: data.siteName ?? existing.siteName,
        checkInAt: now,
        checkInPhotoUrl: data.photoUrl ?? null,
        checkInLat: data.lat ?? null,
        checkInLng: data.lng ?? null,
        checkInScore: data.score ?? null,
        verifyStatus: data.verifyStatus || 'REVIEW',
        updatedAt: now,
      })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    return { record: row, already: false as const }
  }

  const { data: row, error } = await supabase
    .from('Attendance')
    .insert({
      id: newId(),
      workerId: data.workerId,
      siteId: data.siteId ?? null,
      siteName: data.siteName ?? null,
      date: data.date,
      checkInAt: now,
      checkInPhotoUrl: data.photoUrl ?? null,
      checkInLat: data.lat ?? null,
      checkInLng: data.lng ?? null,
      checkInScore: data.score ?? null,
      verifyStatus: data.verifyStatus || 'REVIEW',
      updatedAt: now,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return { record: row, already: false as const }
}

// 퇴근 처리: 당일 기록에 퇴근 정보 + 근무시간(분) 자동계산.
export async function checkOut(data: {
  workerId: string
  date: string
  photoUrl?: string | null
  lat?: number | null
  lng?: number | null
  score?: number | null
}) {
  const { data: existing, error: findErr } = await supabase
    .from('Attendance')
    .select('*')
    .eq('workerId', data.workerId)
    .eq('date', data.date)
    .maybeSingle()
  if (findErr) throw new Error(findErr.message)
  if (!existing || !existing.checkInAt) {
    throw new Error('출근 기록이 없습니다. 먼저 출근 체크를 해주세요.')
  }
  if (existing.checkOutAt) {
    return { record: existing, already: true as const }
  }

  const now = new Date()
  const inAt = new Date(existing.checkInAt)
  const workMinutes = Math.max(0, Math.round((now.getTime() - inAt.getTime()) / 60000))

  const { data: row, error } = await supabase
    .from('Attendance')
    .update({
      checkOutAt: now.toISOString(),
      checkOutPhotoUrl: data.photoUrl ?? null,
      checkOutLat: data.lat ?? null,
      checkOutLng: data.lng ?? null,
      checkOutScore: data.score ?? null,
      workMinutes,
      updatedAt: now.toISOString(),
    })
    .eq('id', existing.id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return { record: row, already: false as const }
}

// 관리자: 출퇴근 검증 상태 변경 (CONFIRMED/REJECTED 등)
export async function setAttendanceVerify(id: string, verifyStatus: string, note?: string) {
  const patch: any = { verifyStatus, updatedAt: new Date().toISOString() }
  if (note !== undefined) patch.note = note
  const { error } = await supabase.from('Attendance').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/workers')
}

// 특정 근로자의 당일 기록
export async function getTodayAttendance(workerId: string, date: string) {
  const { data, error } = await supabase
    .from('Attendance')
    .select('*')
    .eq('workerId', workerId)
    .eq('date', date)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

// 날짜별 전체 출퇴근 (근로자 정보 조인)
export async function getAttendanceByDate(date: string) {
  const { data, error } = await supabase
    .from('Attendance')
    .select('*, Worker(*)')
    .eq('date', date)
    .order('checkInAt', { ascending: true })
  if (error) throw new Error(error.message)
  return data || []
}

// 웹 푸시 구독 저장 (endpoint 중복 시 갱신)
export async function savePushSub(sub: { endpoint: string; p256dh: string; auth: string }, label?: string, userName?: string) {
  const { data: existing } = await supabase.from('PushSub').select('id').eq('endpoint', sub.endpoint).maybeSingle()
  if (existing) {
    const { error } = await supabase.from('PushSub').update({ p256dh: sub.p256dh, auth: sub.auth, label: label ?? null, userName: userName ?? null }).eq('id', existing.id)
    if (error) throw new Error(error.message)
    return existing.id
  }
  const { data, error } = await supabase.from('PushSub').insert({
    id: newId(), endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, label: label ?? null, userName: userName ?? null,
  }).select('id').single()
  if (error) throw new Error(error.message)
  return data.id
}

// 월별 출퇴근 (정산/집계용)
export async function getAttendanceByMonth(year: number, month: number, siteId?: string) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(endDate).padStart(2, '0')}`
  let q = supabase
    .from('Attendance')
    .select('*, Worker(*)')
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: true })
  if (siteId) q = q.eq('siteId', siteId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data || []
}
