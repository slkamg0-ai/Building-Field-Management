'use server'

import prisma from '../prisma'
import { revalidatePath } from 'next/cache'
import { clearSession, createSession, getSessionUser, hashPin, requireAdmin, requireUser, verifyPin } from '../auth'
import { publicUser } from './_shared'

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

