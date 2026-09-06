'use server'

import prisma from '../prisma'
import { requireAdmin } from '../auth'

// ════════════════════════════════════════════════════════════════
//  전체 DB 백업 다운로드 (Data Loss Prevention Backup)
// ════════════════════════════════════════════════════════════════
export async function exportDatabaseBackup() {
  await requireAdmin()

  const [
    sites,
    users,
    userSites,
    dailyLogs,
    labors,
    equipments,
    materials,
    expenses,
    outsourcings,
    photos,
    workers,
    workerDocuments,
    equipmentMasters,
    equipmentDocuments,
    contractItems,
    workQuantities,
    monthlyProgressClaims,
  ] = await Promise.all([
    prisma.site.findMany(),
    prisma.user.findMany({ select: { id: true, name: true, role: true, isActive: true, createdAt: true } }),
    prisma.userSite.findMany(),
    prisma.dailyLog.findMany(),
    prisma.labor.findMany(),
    prisma.equipment.findMany(),
    prisma.material.findMany(),
    prisma.expense.findMany(),
    prisma.outsourcing.findMany(),
    prisma.photo.findMany(),
    prisma.worker.findMany(),
    prisma.workerDocument.findMany(),
    prisma.equipmentMaster.findMany(),
    prisma.equipmentDocument.findMany(),
    prisma.contractItem.findMany(),
    prisma.workQuantity.findMany(),
    prisma.monthlyProgressClaim.findMany(),
  ])

  const backupData = {
    metadata: {
      system: 'Building-Field-Management',
      version: '2.0.1',
      exportedAt: new Date().toISOString(),
      counts: {
        sites: sites.length,
        users: users.length,
        dailyLogs: dailyLogs.length,
        labors: labors.length,
        equipments: equipments.length,
        materials: materials.length,
        expenses: expenses.length,
        outsourcings: outsourcings.length,
        workers: workers.length,
        equipmentMasters: equipmentMasters.length,
      },
    },
    tables: {
      sites,
      users,
      userSites,
      dailyLogs,
      labors,
      equipments,
      materials,
      expenses,
      outsourcings,
      photos,
      workers,
      workerDocuments,
      equipmentMasters,
      equipmentDocuments,
      contractItems,
      workQuantities,
      monthlyProgressClaims,
    },
  }

  return JSON.stringify(backupData, null, 2)
}
