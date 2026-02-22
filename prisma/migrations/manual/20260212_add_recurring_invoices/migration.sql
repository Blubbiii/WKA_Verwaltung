-- CreateTable: recurring_invoices
-- Wiederkehrende Rechnungen - automatische Rechnungsgenerierung nach Zeitplan

CREATE TABLE "recurring_invoices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "recipientType" TEXT NOT NULL,
    "recipientId" TEXT,
    "recipientName" TEXT NOT NULL,
    "recipientAddress" TEXT,
    "invoiceType" TEXT NOT NULL DEFAULT 'INVOICE',
    "positions" JSONB NOT NULL,
    "frequency" TEXT NOT NULL,
    "dayOfMonth" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "totalGenerated" INTEGER NOT NULL DEFAULT 0,
    "lastInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "fundId" TEXT,
    "parkId" TEXT,

    CONSTRAINT "recurring_invoices_pkey" PRIMARY KEY ("id")
);

-- Indexes for performance
CREATE INDEX "recurring_invoices_tenantId_enabled_idx" ON "recurring_invoices"("tenantId", "enabled");
CREATE INDEX "recurring_invoices_nextRunAt_idx" ON "recurring_invoices"("nextRunAt");
CREATE INDEX "recurring_invoices_tenantId_nextRunAt_idx" ON "recurring_invoices"("tenantId", "nextRunAt");

-- Foreign Keys
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
