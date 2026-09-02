-- AlterTable
ALTER TABLE "MonthlyProgressClaim" ADD COLUMN     "cumulativeCostAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "cumulativeProfitAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;
