'use server'

import prisma from '../prisma'
import { requireSiteAccess } from '../auth'

// ════════════════════════════════════════════════════════════════
//  통계
// ════════════════════════════════════════════════════════════════
export async function getMonthlyStats(siteId: string, dateString: string) {
  await requireSiteAccess(siteId)
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
  await requireSiteAccess(siteId)
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) return null

  const [laborAgg, equipAgg, expenseAgg, outAgg] = await Promise.all([
    prisma.labor.aggregate({
      _sum: { totalPrice: true },
      where: { log: { siteId } },
    }),
    prisma.equipment.aggregate({
      _sum: { totalPrice: true },
      where: { log: { siteId } },
    }),
    prisma.expense.aggregate({
      _sum: { amount: true },
      where: { log: { siteId } },
    }),
    prisma.outsourcing.aggregate({
      _sum: { amount: true },
      where: { log: { siteId } },
    }),
  ])

  const totalLabor = laborAgg._sum.totalPrice || 0
  const totalEquipment = equipAgg._sum.totalPrice || 0
  const totalExpense = expenseAgg._sum.amount || 0
  const totalOutsourcing = outAgg._sum.amount || 0
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

