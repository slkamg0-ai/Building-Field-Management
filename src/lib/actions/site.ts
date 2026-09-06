'use server'

import prisma from '../prisma'
import { revalidatePath } from 'next/cache'
import { requireAdmin, requireUser } from '../auth'

// ════════════════════════════════════════════════════════════════
//  현장 관리
// ════════════════════════════════════════════════════════════════
export async function getSites() {
  const user = await requireUser()
  if (user.role === 'ADMIN') {
    return prisma.site.findMany({ orderBy: { createdAt: 'desc' } })
  }
  return prisma.site.findMany({
    where: { userAccess: { some: { userId: user.id } } },
    orderBy: { createdAt: 'desc' },
  })
}

// 관리자가 사용자별 현장 배정을 관리하기 위한 조회/설정
export async function getUserSiteIds(userId: string) {
  await requireAdmin()
  const rows = await prisma.userSite.findMany({ where: { userId }, select: { siteId: true } })
  return rows.map(r => r.siteId)
}

export async function setUserSites(userId: string, siteIds: string[]) {
  await requireAdmin()
  await prisma.$transaction([
    prisma.userSite.deleteMany({ where: { userId } }),
    prisma.userSite.createMany({ data: siteIds.map(siteId => ({ userId, siteId })) }),
  ])
  revalidatePath('/')
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

export async function resetSiteData(siteId: string, safetyConfirmation: string) {
  await requireAdmin()
  if (safetyConfirmation !== '현장데이터초기화확인') {
    throw new Error('안전 잠금장치: 확인 문구가 일치하지 않아 데이터 삭제가 차단되었습니다.')
  }
  await prisma.dailyLog.deleteMany({ where: { siteId } })
  revalidatePath('/')
}

