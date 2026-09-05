import prisma from '../prisma'
import { requireSiteAccess } from '../auth'

// logId를 가진 항목(노무/장비/자재/경비/외주/사진/시공수량 등)에 접근하기 전, 그 항목이 속한 현장에 대한
// 권한을 확인한다. ADMIN은 항상 통과하고, WORKER는 배정된 현장의 로그만 다룰 수 있다.
export async function requireLogSiteAccess(logId: string) {
  const log = await prisma.dailyLog.findUnique({ where: { id: logId }, select: { siteId: true } })
  if (!log) throw new Error('존재하지 않는 일보입니다.')
  const user = await requireSiteAccess(log.siteId)
  return { user, siteId: log.siteId }
}

// id가 가리키는 항목(Labor/Equipment/... 등, logId를 가진 레코드)이 속한 현장의 접근 권한을 확인한다.
export async function requireRecordSiteAccess<T extends { findUnique: (args: any) => Promise<{ logId: string } | null> }>(
  model: T,
  id: string,
) {
  const record = await model.findUnique({ where: { id }, select: { logId: true } })
  if (!record) throw new Error('존재하지 않는 항목입니다.')
  return requireLogSiteAccess(record.logId)
}

export function publicUser(user: { id: string; name: string; role: string; isActive?: boolean }) {
  return { id: user.id, name: user.name, role: user.role, isActive: user.isActive }
}
