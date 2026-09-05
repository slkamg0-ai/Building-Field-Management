'use server'

import prisma from '../prisma'
import { revalidatePath } from 'next/cache'
import { requireAdmin, requireUser } from '../auth'

// ════════════════════════════════════════════════════════════════
//  피드백/요구사항 게시판 — 초기 운영 단계 사용자 리콜용
// ════════════════════════════════════════════════════════════════
export async function getFeedbacks() {
  await requireUser()
  return prisma.feedback.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] })
}

export async function createFeedback(content: string, category: string = 'REQUEST') {
  const user = await requireUser()
  if (!content.trim()) throw new Error('내용을 입력해주세요.')
  const safeCategory = ['REQUEST', 'BUG', 'ETC'].includes(category) ? category : 'REQUEST'
  const row = await prisma.feedback.create({
    data: { content: content.trim(), category: safeCategory, createdBy: user.name },
  })
  revalidatePath('/')
  return row
}

export async function updateFeedbackStatus(id: string, status: string) {
  await requireAdmin()
  const safeStatus = ['OPEN', 'IN_PROGRESS', 'DONE'].includes(status) ? status : 'OPEN'
  await prisma.feedback.update({
    where: { id },
    data: { status: safeStatus, resolvedAt: safeStatus === 'DONE' ? new Date() : null },
  })
  revalidatePath('/')
}

export async function deleteFeedback(id: string) {
  const user = await requireUser()
  const row = await prisma.feedback.findUnique({ where: { id } })
  if (!row) return
  if (user.role !== 'ADMIN' && row.createdBy !== user.name) {
    throw new Error('본인이 작성한 항목만 삭제할 수 있습니다.')
  }
  await prisma.feedback.delete({ where: { id } })
  revalidatePath('/')
}
