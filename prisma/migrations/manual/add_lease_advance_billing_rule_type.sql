-- Add LEASE_ADVANCE to BillingRuleType enum
-- This enables automatic monthly advance lease invoices (Pacht-Vorschussrechnungen)

ALTER TYPE "BillingRuleType" ADD VALUE IF NOT EXISTS 'LEASE_ADVANCE';
