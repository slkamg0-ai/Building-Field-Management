-- MonthlyBilling.totalLaborCost: Int -> Float (overflow-proof monthly aggregate sum)
ALTER TABLE "MonthlyBilling" ALTER COLUMN "totalLaborCost" TYPE DOUBLE PRECISION;
