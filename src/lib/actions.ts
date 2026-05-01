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
    .select('*, Labor(*), Equipment(*), Material(*), Expense(*), Outsourcing(*)')
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

  return { ...newLog, labors: [], equipments: [], materials: [], expenses: [], outsourcings: [] }
}

function normalizeLog(log: any) {
  return {
    ...log,
    labors: log.Labor || [],
    equipments: log.Equipment || [],
    materials: log.Material || [],
    expenses: log.Expense || [],
    outsourcings: log.Outsourcing || [],
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
  })
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
