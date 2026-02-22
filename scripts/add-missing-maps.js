const fs = require('fs');

// All model-to-table mappings for models that were renamed from snake_case
// This is the REVERSE of the tableToModel mapping from fix-schema.js
const modelToTable = {
  'ArchiveVerificationLog': 'archive_verification_logs',
  'ArchivedDocument': 'archived_documents',
  'BillingRuleExecution': 'billing_rule_executions',
  'BillingRule': 'billing_rules',
  'DistributionItem': 'distribution_items',
  'Distribution': 'distributions',
  'DocumentTemplate': 'document_templates',
  'EmailTemplate': 'email_templates',
  'EnergyMonthlyRate': 'energy_monthly_rates',
  'EnergyReportConfig': 'energy_report_configs',
  'EnergyRevenueType': 'energy_revenue_types',
  'EnergySettlementItem': 'energy_settlement_items',
  'EnergySettlement': 'energy_settlements',
  'FundCategory': 'fund_categories',
  'FundHierarchy': 'fund_hierarchies',
  'GeneratedReport': 'generated_reports',
  'InvoiceItemTemplate': 'invoice_item_templates',
  'InvoiceItem': 'invoice_items',
  'InvoiceNumberSequence': 'invoice_number_sequences',
  'InvoiceTemplate': 'invoice_templates',
  'LeasePlot': 'lease_plots',
  'LeaseRevenueSettlementItem': 'lease_revenue_settlement_items',
  'LeaseRevenueSettlement': 'lease_revenue_settlements',
  'LeaseSettlementPeriod': 'lease_settlement_periods',
  'Letterhead': 'letterheads',
  'ManagementBilling': 'management_billings',
  'MassCommunication': 'mass_communications',
  'NetworkConnection': 'network_connections',
  'NetworkNode': 'network_nodes',
  'ParkCostAllocationItem': 'park_cost_allocation_items',
  'ParkCostAllocation': 'park_cost_allocations',
  'ParkRevenuePhase': 'park_revenue_phases',
  'ParkStakeholder': 'park_stakeholders',
  'PasswordResetToken': 'password_reset_tokens',
  'Permission': 'permissions',
  'PlotArea': 'plot_areas',
  'RecurringInvoice': 'recurring_invoices',
  'ReminderLog': 'reminder_logs',
  'ResourceAccess': 'resource_access',
  'RolePermission': 'role_permissions',
  'Role': 'roles',
  'ScadaAnomaly': 'scada_anomalies',
  'ScadaAnomalyConfig': 'scada_anomaly_configs',
  'ScadaAutoImportLog': 'scada_auto_import_logs',
  'ScadaAvailability': 'scada_availability',
  'ScadaImportLog': 'scada_import_logs',
  'ScadaMeasurement': 'scada_measurements',
  'ScadaStateEvent': 'scada_state_events',
  'ScadaStateSummary': 'scada_state_summaries',
  'ScadaTextEvent': 'scada_text_events',
  'ScadaTurbineMapping': 'scada_turbine_mappings',
  'ScadaWarningEvent': 'scada_warning_events',
  'ScadaWarningSummary': 'scada_warning_summaries',
  'ScadaWindSummary': 'scada_wind_summaries',
  'ScheduledReport': 'scheduled_reports',
  'StakeholderFeeHistory': 'stakeholder_fee_history',
  'SystemConfig': 'system_configs',
  'TurbineOperator': 'turbine_operators',
  'TurbineProduction': 'turbine_productions',
  'UserRoleAssignment': 'user_role_assignments',
};

let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
const lines = schema.split('\n');
const newLines = [];
let currentModel = null;
let hasMap = false;
let addCount = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();

  // Detect model start
  const modelMatch = trimmed.match(/^model\s+(\w+)\s*\{/);
  if (modelMatch) {
    currentModel = modelMatch[1];
    hasMap = false;
    newLines.push(line);
    continue;
  }

  // Detect existing @@map
  if (trimmed.startsWith('@@map(')) {
    hasMap = true;
    newLines.push(line);
    continue;
  }

  // Detect model end - closing brace
  if (trimmed === '}' && currentModel) {
    // Check if this model needs a @@map
    if (!hasMap && modelToTable[currentModel]) {
      // Insert @@map before the closing brace
      newLines.push(`  @@map("${modelToTable[currentModel]}")`);
      addCount++;
      console.log(`  Added @@map("${modelToTable[currentModel]}") to model ${currentModel}`);
    }
    currentModel = null;
    hasMap = false;
    newLines.push(line);
    continue;
  }

  newLines.push(line);
}

fs.writeFileSync('prisma/schema.prisma', newLines.join('\n'));
console.log(`\nDone! Added ${addCount} @@map annotations.`);
