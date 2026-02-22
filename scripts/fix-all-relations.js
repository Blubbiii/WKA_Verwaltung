/**
 * Comprehensive Prisma schema relation field name fixer.
 * Fixes ALL auto-generated relation names from `prisma db pull` to match
 * the names expected by the application code.
 */
const fs = require('fs');
let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
let changeCount = 0;

function replace(old, newStr) {
  if (!schema.includes(old)) {
    console.warn(`  WARNING: Not found: "${old.trim().substring(0, 60)}..."`);
    return;
  }
  schema = schema.replace(old, newStr);
  changeCount++;
}

// Helper: replace all occurrences
function replaceAll(old, newStr) {
  const count = (schema.match(new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  if (count === 0) {
    console.warn(`  WARNING: Not found (replaceAll): "${old.substring(0, 60)}..."`);
    return;
  }
  schema = schema.split(old).join(newStr);
  changeCount += count;
  console.log(`  Replaced ${count}x: "${old.substring(0, 50)}"`);
}

console.log('=== Group 1: tenants → tenant (FK-holding side) ===');
// Replace all lines where "tenants" is a FK relation to Tenant (not the array on Tenant model)
// Pattern: "  tenants" + whitespace + "Tenant" + whitespace/? + "@relation(fields:"
// We use a regex to handle variable whitespace
const tenantFkRegex = /^(\s+)tenants(\s+)(Tenant\??\s+@relation\(fields:)/gm;
const tenantMatches = schema.match(tenantFkRegex);
if (tenantMatches) {
  console.log(`  Found ${tenantMatches.length} tenant FK relations to rename`);
  schema = schema.replace(tenantFkRegex, '$1tenant$2$3');
  changeCount += tenantMatches.length;
} else {
  console.warn('  WARNING: No tenant FK relations found');
}

console.log('\n=== Group 2: parks → park (FK-holding side) ===');
const parkFkRegex = /^(\s+)parks(\s+)(Park\??\s+@relation\(fields:)/gm;
const parkMatches = schema.match(parkFkRegex);
if (parkMatches) {
  console.log(`  Found ${parkMatches.length} park FK relations to rename`);
  schema = schema.replace(parkFkRegex, '$1park$2$3');
  changeCount += parkMatches.length;
}

console.log('\n=== Group 3: turbines → turbine (FK-holding side on NetworkNode) ===');
const turbineFkRegex = /^(\s+)turbines(\s+)(Turbine\??\s+@relation\(fields:)/gm;
const turbineMatches = schema.match(turbineFkRegex);
if (turbineMatches) {
  console.log(`  Found ${turbineMatches.length} turbine FK relations to rename`);
  schema = schema.replace(turbineFkRegex, '$1turbine$2$3');
  changeCount += turbineMatches.length;
}

console.log('\n=== Group 4: users → context-specific (FK-holding side) ===');
// For "users" FK relations, the target name depends on the FK column
// Pattern: "  users  User  @relation(fields: [columnName]"
const userFkRegex = /^(\s+)users(\s+)(User\??\s+@relation\(fields:\s*\[(\w+)\])/gm;
let match;
const userReplacements = [];
const tmpSchema = schema;
while ((match = userFkRegex.exec(tmpSchema)) !== null) {
  const [fullMatch, indent, space, rest, fkColumn] = match;
  let newName;
  if (fkColumn === 'verifiedById') newName = 'verifiedBy';
  else if (fkColumn === 'archivedById') newName = 'archivedBy';
  else if (fkColumn === 'createdById') newName = 'createdBy';
  else if (fkColumn === 'generatedById') newName = 'generatedBy';
  else if (fkColumn === 'userId') newName = 'user';
  else if (fkColumn === 'acknowledgedById') newName = 'acknowledgedBy';
  else {
    console.warn(`  Unknown user FK column: ${fkColumn}`);
    newName = 'user';
  }
  userReplacements.push({ old: fullMatch, new: `${indent}${newName}${space}${rest}` });
}
// Apply in reverse order to preserve indices
for (const r of userReplacements.reverse()) {
  replace(r.old, r.new);
  console.log(`  users → ${r.new.trim().split(/\s+/)[0]}`);
}

console.log('\n=== Group 5: Fund ↔ FundHierarchy ambiguous relations ===');
// FundHierarchy model
replace(
  'funds_fund_hierarchies_childFundIdTofunds  Fund      @relation("fund_hierarchies_childFundIdTofunds"',
  'childFund  Fund      @relation("ChildHierarchy"'
);
replace(
  'funds_fund_hierarchies_parentFundIdTofunds Fund      @relation("fund_hierarchies_parentFundIdTofunds"',
  'parentFund Fund      @relation("ParentHierarchy"'
);
// Fund model (reverse side)
replace(
  'fund_hierarchies_fund_hierarchies_childFundIdTofunds  FundHierarchy[]               @relation("fund_hierarchies_childFundIdTofunds")',
  'parentHierarchies  FundHierarchy[]               @relation("ChildHierarchy")'
);
replace(
  'fund_hierarchies_fund_hierarchies_parentFundIdTofunds FundHierarchy[]               @relation("fund_hierarchies_parentFundIdTofunds")',
  'childHierarchies FundHierarchy[]               @relation("ParentHierarchy")'
);

console.log('\n=== Group 6: Fund ↔ Lease ambiguous relations ===');
// Lease model
replace(
  'funds_leases_contractPartnerFundIdTofunds Fund?                            @relation("leases_contractPartnerFundIdTofunds"',
  'contractPartnerFund Fund?                            @relation("LeaseContractPartner"'
);
replace(
  'funds_leases_directBillingFundIdTofunds   Fund?                            @relation("leases_directBillingFundIdTofunds"',
  'directBillingFund   Fund?                            @relation("LeaseDirectBilling"'
);
// Fund model (reverse)
replace(
  'leases_leases_contractPartnerFundIdTofunds            Lease[]                          @relation("leases_contractPartnerFundIdTofunds")',
  'contractPartnerLeases            Lease[]                          @relation("LeaseContractPartner")'
);
replace(
  'leases_leases_directBillingFundIdTofunds              Lease[]                          @relation("leases_directBillingFundIdTofunds")',
  'directBillingLeases              Lease[]                          @relation("LeaseDirectBilling")'
);

console.log('\n=== Group 7: Fund ↔ Park ambiguous relations ===');
// Park model
replace(
  'funds_parks_billingEntityFundIdTofunds Fund?                       @relation("parks_billingEntityFundIdTofunds"',
  'billingEntityFund Fund?                       @relation("ParkBillingEntity"'
);
replace(
  'funds_parks_operatorFundIdTofunds      Fund?                       @relation("parks_operatorFundIdTofunds"',
  'operatorFund      Fund?                       @relation("ParkOperator"'
);
// Fund model (reverse)
replace(
  'parks_parks_billingEntityFundIdTofunds                Park[]                           @relation("parks_billingEntityFundIdTofunds")',
  'billingEntityParks                Park[]                           @relation("ParkBillingEntity")'
);
replace(
  'parks_parks_operatorFundIdTofunds                     Park[]                           @relation("parks_operatorFundIdTofunds")',
  'operatorParks                     Park[]                           @relation("ParkOperator")'
);

console.log('\n=== Group 8: Turbine → Fund (netzgesellschaft) ===');
replace(
  '  funds                          Fund?                     @relation(fields: [netzgesellschaftFundId]',
  '  netzgesellschaftFund           Fund?                     @relation(fields: [netzgesellschaftFundId]'
);

console.log('\n=== Group 9: Fund.fundCategories → Fund.fundCategory ===');
replace(
  '  fundCategories                                        FundCategory?                 @relation(fields: [fundCategoryId]',
  '  fundCategory                                          FundCategory?                 @relation(fields: [fundCategoryId]'
);

console.log('\n=== Group 10: NetworkConnection ↔ NetworkNode ambiguous relations ===');
// NetworkConnection model
replace(
  'network_nodes_network_connections_fromNodeIdTonetwork_nodes NetworkNode @relation("network_connections_fromNodeIdTonetwork_nodes"',
  'fromNode NetworkNode @relation("NetworkConnectionFrom"'
);
replace(
  'network_nodes_network_connections_toNodeIdTonetwork_nodes   NetworkNode @relation("network_connections_toNodeIdTonetwork_nodes"',
  'toNode   NetworkNode @relation("NetworkConnectionTo"'
);
// NetworkNode model (reverse)
replace(
  'network_connections_network_connections_fromNodeIdTonetwork_nodes NetworkConnection[] @relation("network_connections_fromNodeIdTonetwork_nodes")',
  'fromConnections NetworkConnection[] @relation("NetworkConnectionFrom")'
);
replace(
  'network_connections_network_connections_toNodeIdTonetwork_nodes   NetworkConnection[] @relation("network_connections_toNodeIdTonetwork_nodes")',
  'toConnections   NetworkConnection[] @relation("NetworkConnectionTo")'
);

console.log('\n=== Group 11: Invoice self-referencing relations ===');
// Invoice cancelledInvoice
replace(
  'invoices_invoices_cancelledInvoiceIdToinvoices                                              Invoice?                        @relation("invoices_cancelledInvoiceIdToinvoices"',
  'cancelledInvoice                                              Invoice?                        @relation("InvoiceCancellation"'
);
replace(
  'other_invoices_invoices_cancelledInvoiceIdToinvoices                                        Invoice[]                       @relation("invoices_cancelledInvoiceIdToinvoices")',
  'cancellationInvoices                                        Invoice[]                       @relation("InvoiceCancellation")'
);
// Invoice correctionOf
replace(
  'invoices_invoices_correctionOfToinvoices                                                    Invoice?                        @relation("invoices_correctionOfToinvoices"',
  'correctedInvoice                                                    Invoice?                        @relation("InvoiceCorrection"'
);
replace(
  'other_invoices_invoices_correctionOfToinvoices                                              Invoice[]                       @relation("invoices_correctionOfToinvoices")',
  'correctionInvoices                                              Invoice[]                       @relation("InvoiceCorrection")'
);

console.log('\n=== Group 12: Invoice ↔ User ambiguous relations ===');
// Invoice model
replace(
  'users_invoices_emailedByIdTousers                                                           User?                           @relation("invoices_emailedByIdTousers"',
  'emailedBy                                                           User?                           @relation("InvoiceEmailedBy"'
);
replace(
  'users_invoices_printedByIdTousers                                                           User?                           @relation("invoices_printedByIdTousers"',
  'printedBy                                                           User?                           @relation("InvoicePrintedBy"'
);
// User model (reverse)
replace(
  'invoices_invoices_emailedByIdTousers                                    Invoice[]                   @relation("invoices_emailedByIdTousers")',
  'emailedInvoices                                    Invoice[]                   @relation("InvoiceEmailedBy")'
);
replace(
  'invoices_invoices_printedByIdTousers                                    Invoice[]                   @relation("invoices_printedByIdTousers")',
  'printedInvoices                                    Invoice[]                   @relation("InvoicePrintedBy")'
);

console.log('\n=== Group 13: Document ↔ User (reviewedBy) ===');
// Document model
replace(
  'users_documents_reviewedByIdTousers User?                  @relation("documents_reviewedByIdTousers"',
  'reviewedBy User?                  @relation("DocumentReviewedBy"'
);
// User model (reverse)
replace(
  'documents_documents_reviewedByIdTousers                                 Document[]                  @relation("documents_reviewedByIdTousers")',
  'reviewedDocuments                                 Document[]                  @relation("DocumentReviewedBy")'
);

console.log('\n=== Group 14: LeaseRevenueSettlement ↔ User ambiguous relations ===');
// LeaseRevenueSettlement model
replace(
  'users_lease_revenue_settlements_createdByIdTousers  User?                            @relation("lease_revenue_settlements_createdByIdTousers"',
  'createdBy  User?                            @relation("LeaseRevenueSettlementCreatedBy"'
);
replace(
  'users_lease_revenue_settlements_reviewedByIdTousers User?                            @relation("lease_revenue_settlements_reviewedByIdTousers"',
  'reviewedBy User?                            @relation("LeaseRevenueSettlementReviewedBy"'
);
// User model (reverse)
replace(
  'lease_revenue_settlements_lease_revenue_settlements_createdByIdTousers  LeaseRevenueSettlement[] @relation("lease_revenue_settlements_createdByIdTousers")',
  'createdLeaseRevenueSettlements  LeaseRevenueSettlement[] @relation("LeaseRevenueSettlementCreatedBy")'
);
replace(
  'lease_revenue_settlements_lease_revenue_settlements_reviewedByIdTousers LeaseRevenueSettlement[] @relation("lease_revenue_settlements_reviewedByIdTousers")',
  'reviewedLeaseRevenueSettlements LeaseRevenueSettlement[] @relation("LeaseRevenueSettlementReviewedBy")'
);

console.log('\n=== Group 15: LeaseSettlementPeriod ↔ User ambiguous relations ===');
// LeaseSettlementPeriod model
replace(
  'users_lease_settlement_periods_createdByIdTousers  User?                  @relation("lease_settlement_periods_createdByIdTousers"',
  'createdBy  User?                  @relation("LeaseSettlementPeriodCreatedBy"'
);
replace(
  'users_lease_settlement_periods_reviewedByIdTousers   User?                  @relation("lease_settlement_periods_reviewedByIdTousers"',
  'reviewedBy   User?                  @relation("LeaseSettlementPeriodReviewedBy"'
);
// User model (reverse)
replace(
  'lease_settlement_periods_lease_settlement_periods_createdByIdTousers    LeaseSettlementPeriod[]  @relation("lease_settlement_periods_createdByIdTousers")',
  'createdLeaseSettlementPeriods    LeaseSettlementPeriod[]  @relation("LeaseSettlementPeriodCreatedBy")'
);
replace(
  'lease_settlement_periods_lease_settlement_periods_reviewedByIdTousers   LeaseSettlementPeriod[]  @relation("lease_settlement_periods_reviewedByIdTousers")',
  'reviewedLeaseSettlementPeriods   LeaseSettlementPeriod[]  @relation("LeaseSettlementPeriodReviewedBy")'
);

console.log('\n=== Group 16: LeaseRevenueSettlementItem relations ===');
// LeaseRevenueSettlementItem: invoices → advanceInvoice/settlementInvoice
replace(
  'invoices_lease_revenue_settlement_items_advanceInvoiceIdToinvoices    Invoice?                  @relation("lease_revenue_settlement_items_advanceInvoiceIdToinvoices"',
  'advanceInvoice    Invoice?                  @relation("AdvanceInvoice"'
);
replace(
  'invoices_lease_revenue_settlement_items_settlementInvoiceIdToinvoices Invoice?                  @relation("lease_revenue_settlement_items_settlementInvoiceIdToinvoices"',
  'settlementInvoice Invoice?                  @relation("SettlementInvoice"'
);
// Invoice model (reverse)
replace(
  'lease_revenue_settlement_items_lease_revenue_settlement_items_advanceInvoiceIdToinvoices    LeaseRevenueSettlementItem? @relation("lease_revenue_settlement_items_advanceInvoiceIdToinvoices")',
  'advanceSettlementItem    LeaseRevenueSettlementItem? @relation("AdvanceInvoice")'
);
replace(
  'lease_revenue_settlement_items_lease_revenue_settlement_items_settlementInvoiceIdToinvoices LeaseRevenueSettlementItem? @relation("lease_revenue_settlement_items_settlementInvoiceIdToinvoices")',
  'settlementSettlementItem LeaseRevenueSettlementItem? @relation("SettlementInvoice")'
);

// LeaseRevenueSettlementItem: funds → directBillingFund
replace(
  '  funds                                                                 Fund?                     @relation(fields: [directBillingFundId]',
  '  directBillingFund                                                     Fund?                     @relation(fields: [directBillingFundId]'
);

// LeaseRevenueSettlementItem: leases → lease
replace(
  '  leases                                                                Lease                     @relation(fields: [leaseId]',
  '  lease                                                                 Lease                     @relation(fields: [leaseId]'
);

// LeaseRevenueSettlementItem: persons → lessor
replace(
  '  persons                                                               Person                    @relation(fields: [lessorPersonId]',
  '  lessor                                                                Person                    @relation(fields: [lessorPersonId]'
);

// LeaseRevenueSettlementItem: leaseRevenueSettlements → settlement
replace(
  '  leaseRevenueSettlements                                               LeaseRevenueSettlement @relation(fields: [settlementId]',
  '  settlement                                                            LeaseRevenueSettlement @relation(fields: [settlementId]'
);

console.log('\n=== Group 17: ParkCostAllocationItem ↔ Invoice ambiguous ===');
replace(
  'park_cost_allocation_items_park_cost_allocation_items_exemptInvoiceIdToinvoices             ParkCostAllocationItem?     @relation("park_cost_allocation_items_exemptInvoiceIdToinvoices")',
  'exemptAllocationItem             ParkCostAllocationItem?     @relation("ExemptInvoice")'
);
replace(
  'park_cost_allocation_items_park_cost_allocation_items_vatInvoiceIdToinvoices                ParkCostAllocationItem?     @relation("park_cost_allocation_items_vatInvoiceIdToinvoices")',
  'vatAllocationItem                ParkCostAllocationItem?     @relation("VatInvoice")'
);
// ParkCostAllocationItem model
replace(
  '  exemptInvoice                                                  Invoice?              @relation("park_cost_allocation_items_exemptInvoiceIdToinvoices"',
  '  exemptInvoice                                                  Invoice?              @relation("ExemptInvoice"'
);
replace(
  '  vatInvoice                                                     Invoice?              @relation("park_cost_allocation_items_vatInvoiceIdToinvoices"',
  '  vatInvoice                                                     Invoice?              @relation("VatInvoice"'
);

console.log('\n=== Group 18: Other singular FK renames ===');
// BillingRuleExecution: billingRules → rule
replace(
  '  billingRules    BillingRule @relation(fields: [ruleId]',
  '  rule            BillingRule @relation(fields: [ruleId]'
);

// EnergyMonthlyRate: energyRevenueTypes → revenueType
replace(
  '  energyRevenueTypes   EnergyRevenueType @relation(fields: [revenueTypeId]',
  '  revenueType          EnergyRevenueType @relation(fields: [revenueTypeId]'
);

// EnergyRevenueType: remove stale "users" FK if createdById exists
// Already handled by Group 4

// Invoice: leases → lease (already handled by parks regex? no, leases is different)
// Check if leases on Invoice was already handled
if (schema.includes('  leases                                                                                      Lease?                          @relation(fields: [leaseId]')) {
  replace(
    '  leases                                                                                      Lease?                          @relation(fields: [leaseId]',
    '  lease                                                                                       Lease?                          @relation(fields: [leaseId]'
  );
}

// Invoice: letterheads → letterhead
if (schema.includes('letterheads                                                                                 Letterhead?')) {
  replace(
    '  letterheads                                                                                 Letterhead?                    @relation(fields: [letterheadId]',
    '  letterhead                                                                                  Letterhead?                    @relation(fields: [letterheadId]'
  );
}

// Invoice: leaseSettlementPeriods → settlementPeriod
if (schema.includes('leaseSettlementPeriods                                                                      LeaseSettlementPeriod?')) {
  replace(
    '  leaseSettlementPeriods                                                                      LeaseSettlementPeriod?       @relation(fields: [settlementPeriodId]',
    '  settlementPeriod                                                                            LeaseSettlementPeriod?       @relation(fields: [settlementPeriodId]'
  );
}

// Invoice: documentTemplates → template
if (schema.includes('documentTemplates                                                                           DocumentTemplate?             @relation(fields: [templateId]')) {
  replace(
    '  documentTemplates                                                                           DocumentTemplate?             @relation(fields: [templateId]',
    '  template                                                                                    DocumentTemplate?             @relation(fields: [templateId]'
  );
}

// ParkCostAllocation: leaseRevenueSettlements → leaseRevenueSettlement
if (schema.includes('  leaseRevenueSettlements    LeaseRevenueSettlement    @relation(fields: [leaseRevenueSettlementId]')) {
  replace(
    '  leaseRevenueSettlements    LeaseRevenueSettlement    @relation(fields: [leaseRevenueSettlementId]',
    '  leaseRevenueSettlement     LeaseRevenueSettlement    @relation(fields: [leaseRevenueSettlementId]'
  );
}

// LeaseRevenueSettlement: energySettlements → linkedEnergySettlement
if (schema.includes('energySettlements                                   EnergySettlement?              @relation(fields: [linkedEnergySettlementId]')) {
  replace(
    '  energySettlements                                   EnergySettlement?              @relation(fields: [linkedEnergySettlementId]',
    '  linkedEnergySettlement                              EnergySettlement?              @relation(fields: [linkedEnergySettlementId]'
  );
}

// LeaseSettlementPeriod: energySettlements → linkedEnergySettlement
if (schema.includes('energySettlements                                  EnergySettlement?    @relation(fields: [linkedEnergySettlementId]')) {
  replace(
    '  energySettlements                                  EnergySettlement?    @relation(fields: [linkedEnergySettlementId]',
    '  linkedEnergySettlement                             EnergySettlement?    @relation(fields: [linkedEnergySettlementId]'
  );
}

// Document: serviceEvents → serviceEvent
if (schema.includes('serviceEvents                       ServiceEvent?          @relation(fields: [serviceEventId]')) {
  replace(
    '  serviceEvents                       ServiceEvent?          @relation(fields: [serviceEventId]',
    '  serviceEvent                        ServiceEvent?          @relation(fields: [serviceEventId]'
  );
}

// ArchivedDocument self-reference
if (schema.includes('archivedDocuments        ArchivedDocument?  @relation("archived_documentsToarchived_documents"')) {
  replace(
    '  archivedDocuments        ArchivedDocument?  @relation("archived_documentsToarchived_documents"',
    '  previousArchive          ArchivedDocument?  @relation("ArchiveChain"'
  );
  replace(
    '  otherArchivedDocuments   ArchivedDocument[] @relation("archived_documentsToarchived_documents")',
    '  subsequentArchives       ArchivedDocument[] @relation("ArchiveChain")'
  );
}

// Lease: tenants → tenant (should already be handled by Group 1 regex, but check)
// Already handled

// EnergyReportConfig: turbines → turbine (should be handled by Group 3)
// Already handled

// EnergyReportConfig: parks → park (should be handled by Group 2)
// Already handled

console.log('\n=== Group 19: Remaining leases/funds singular renames (non-ambiguous) ===');
// Check for any remaining "leases" FK relations that weren't caught
const leaseFkRegex = /^(\s+)leases(\s+)(Lease\??\s+@relation\(fields:)/gm;
const leaseMatches = schema.match(leaseFkRegex);
if (leaseMatches) {
  console.log(`  Found ${leaseMatches.length} remaining lease FK relations`);
  schema = schema.replace(leaseFkRegex, '$1lease$2$3');
  changeCount += leaseMatches.length;
}

// Check for remaining "funds" FK relations (non-ambiguous - only ones without @relation("name"))
// These are tricky because we need context. Skip for now - they should all be handled.

// Check for remaining "persons" FK relations
const personFkRegex = /^(\s+)persons(\s+)(Person\??\s+@relation\(fields:)/gm;
const personMatches = schema.match(personFkRegex);
if (personMatches) {
  console.log(`  Found ${personMatches.length} remaining person FK relations`);
  // Don't auto-rename - needs context
}

console.log('\n=== Group 20: Stakeholder/ParkStakeholder specific fixes ===');
// ParkStakeholder has stakeholderTenantId FK to Tenant - this needs a specific @relation
// Check if there's an issue

console.log(`\n=== DONE: ${changeCount} changes applied ===`);
fs.writeFileSync('prisma/schema.prisma', schema);
