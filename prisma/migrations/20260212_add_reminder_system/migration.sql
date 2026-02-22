-- CreateEnum
CREATE TYPE "ReminderCategory" AS ENUM ('OVERDUE_INVOICE', 'EXPIRING_CONTRACT', 'OPEN_SETTLEMENT', 'EXPIRING_DOCUMENT');

-- CreateTable
CREATE TABLE "reminder_logs" (
    "id" TEXT NOT NULL,
    "category" "ReminderCategory" NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "urgency" TEXT NOT NULL,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "sentTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "reminder_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reminder_logs_tenantId_idx" ON "reminder_logs"("tenantId");

-- CreateIndex
CREATE INDEX "reminder_logs_tenantId_category_idx" ON "reminder_logs"("tenantId", "category");

-- CreateIndex
CREATE INDEX "reminder_logs_tenantId_entityId_category_idx" ON "reminder_logs"("tenantId", "entityId", "category");

-- CreateIndex
CREATE INDEX "reminder_logs_createdAt_idx" ON "reminder_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
