# WindparkManager API Documentation

> **Base URL:** `http://localhost:3050/api` (Dev) | `https://your-domain/api` (Prod)
> **Auth:** All endpoints require authentication via NextAuth session cookie unless noted otherwise.
> **Tenant isolation:** All data-bearing endpoints are scoped to the current tenant.

---

## Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/callback/credentials` | Login with email/password |
| GET | `/auth/session` | Current session info |
| POST | `/auth/forgot-password` | Request password reset email |
| POST | `/auth/reset-password` | Set new password via token |
| GET | `/auth/sso-config` | SSO/OIDC configuration (public) |
| GET | `/auth/my-permissions` | Permissions of current user |

---

## Parks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/parks` | List all parks (paginated, filterable) |
| POST | `/parks` | Create a new park |
| GET | `/parks/[id]` | Get park details |
| PUT | `/parks/[id]` | Update park |
| DELETE | `/parks/[id]` | Soft-delete park |
| GET | `/parks/[id]/annotations` | List park annotations |
| POST | `/parks/[id]/annotations` | Create annotation |
| GET | `/parks/[id]/revenue-phases` | Revenue phase configuration |

---

## Turbines

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/turbines` | List turbines |
| POST | `/turbines` | Create turbine |
| GET | `/turbines/[id]` | Get turbine details |
| PUT | `/turbines/[id]` | Update turbine |
| POST | `/turbines/[id]/qr-token` | Generate QR code token for technician check-in |

---

## Funds (Gesellschaften)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/funds` | List funds |
| POST | `/funds` | Create fund |
| GET | `/funds/[id]` | Get fund details |
| PUT | `/funds/[id]` | Update fund |
| GET | `/funds/[id]/parks` | Parks assigned to fund |
| POST | `/funds/[id]/recalculate` | Recalculate fund totals |
| GET | `/funds/[id]/distributions` | List distributions |
| POST | `/funds/[id]/distributions` | Create distribution |
| POST | `/funds/[id]/distributions/[distributionId]/execute` | Execute distribution |
| POST | `/funds/[id]/email-test` | Test fund-specific SMTP |
| GET | `/funds/hierarchy` | Full hierarchy list |
| GET | `/funds/hierarchy/tree` | Tree-structured hierarchy |

---

## Invoices (Rechnungen)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/invoices` | List invoices (sortable, filterable) |
| POST | `/invoices` | Create invoice |
| GET | `/invoices/[id]` | Get invoice with items |
| PATCH | `/invoices/[id]` | Update invoice |
| DELETE | `/invoices/[id]` | Delete invoice |
| GET | `/invoices/[id]/pdf` | Generate PDF |
| GET | `/invoices/[id]/preview` | HTML preview |
| POST | `/invoices/[id]/send` | Send invoice via email |
| POST | `/invoices/[id]/email` | Custom email send |
| POST | `/invoices/[id]/mark-paid` | Mark as paid |
| POST | `/invoices/[id]/cancel` | Cancel (Stornierung) |
| POST | `/invoices/[id]/correct` | Issue correction invoice |
| GET | `/invoices/[id]/corrections` | Correction history |
| POST | `/invoices/[id]/send-reminder` | Payment reminder |
| GET | `/invoices/[id]/xrechnung` | XRechnung XML export |
| GET | `/invoices/[id]/print` | Print-optimized view |
| GET/POST | `/invoices/[id]/items` | Invoice line items |
| POST | `/invoices/batch-pdf` | Generate PDF ZIP for multiple invoices |
| POST | `/invoices/batch-send` | Batch email send |
| PATCH | `/invoices/batch-status` | Batch status change |
| POST | `/invoices/bank-import` | Import bank statement |
| POST | `/invoices/bank-import/confirm` | Confirm bank import matches |
| GET | `/invoices/reconciliation` | Reconciliation overview |
| GET | `/invoices/reminders` | Pending reminders |

---

## Contracts (Vertraege)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/contracts` | List contracts |
| POST | `/contracts` | Create contract |
| GET | `/contracts/[id]` | Get contract |
| PUT | `/contracts/[id]` | Update contract |
| DELETE | `/contracts/[id]` | Delete contract |
| GET | `/contracts/[id]/documents` | Contract documents |

---

## Leases (Pachtvertraege)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/leases` | List leases |
| POST | `/leases` | Create lease |
| GET | `/leases/[id]` | Get lease details |
| DELETE | `/leases/[id]` | Delete lease |
| GET | `/leases/[id]/plots` | Plots linked to lease |
| GET | `/leases/payments` | Lease payments |
| POST | `/leases/payments/remind` | Send payment reminders |
| GET | `/leases/settlement` | Settlement periods |
| POST | `/leases/settlement` | Create settlement period |
| POST | `/leases/settlement/[id]/calculate` | Calculate settlement |
| POST | `/leases/settlement/[id]/close` | Close period |
| POST | `/leases/settlement/[id]/invoices` | Generate invoices |
| GET | `/leases/usage-fees` | Usage fee periods |
| POST | `/leases/usage-fees` | Create usage fee period |
| POST | `/leases/usage-fees/[id]/calculate` | Calculate fees |
| POST | `/leases/usage-fees/[id]/settle` | Settle period |
| POST | `/leases/usage-fees/import` | Import usage fee data |
| GET | `/leases/cost-allocation` | Cost allocations |

---

## Plots (Flurstuecke)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/plots` | List plots |
| POST | `/plots` | Create plot |
| GET | `/plots/[id]` | Get plot |
| PUT | `/plots/[id]` | Update plot |
| DELETE | `/plots/[id]` | Delete plot |
| GET | `/plots/[id]/areas` | Sub-areas |
| PUT | `/plots/[id]/geometry` | Update GIS geometry |
| POST | `/plots/[id]/split` | Split plot |
| POST | `/plots/merge` | Merge multiple plots |
| POST | `/plots/bulk` | Bulk operations |
| POST | `/plots/import-shp` | Import from Shapefile |
| POST | `/plots/import-shp/confirm` | Confirm Shapefile import |

---

## Documents (Dokumente)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/documents` | List documents |
| POST | `/documents` | Upload document |
| GET | `/documents/[id]` | Get document metadata |
| PATCH | `/documents/[id]` | Update metadata |
| DELETE | `/documents/[id]` | Delete document |
| GET | `/documents/[id]/content` | Download file content |
| GET | `/documents/[id]/download` | Download with filename |
| POST | `/documents/[id]/approve` | Approve document |
| GET | `/documents/[id]/versions` | Version history |
| GET | `/documents/search` | Search documents |
| GET | `/documents/health` | Document storage health |
| GET | `/documents/explorer/tree` | Virtual folder tree |
| POST | `/documents/explorer/folder` | Create virtual folder |
| POST | `/documents/explorer/download-zip` | Download folder as ZIP |

---

## Energy / SCADA

### Production Data

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/energy/productions` | List production records |
| POST | `/energy/productions` | Create production record |
| GET | `/energy/productions/[id]` | Get production record |
| POST | `/energy/productions/import` | CSV import |
| GET | `/energy/productions/sample-csv` | Download sample CSV template |
| GET | `/energy/productions/for-settlement` | Productions for settlement period |

### Settlements (Abrechnungen)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/energy/settlements` | List energy settlements |
| POST | `/energy/settlements` | Create settlement |
| GET | `/energy/settlements/[id]` | Get settlement |
| POST | `/energy/settlements/[id]/calculate` | Calculate settlement |
| POST | `/energy/settlements/[id]/create-invoices` | Generate invoices |
| POST | `/energy/settlements/batch-upsert` | Batch create/update |

### SCADA

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/energy/scada/measurements` | Query SCADA measurements |
| POST | `/energy/scada/upload` | Upload SCADA files (UI) |
| POST | `/energy/scada/upload/preview` | Preview file before import |
| POST | `/energy/scada/import` | Start SCADA import job |
| GET | `/energy/scada/import/[id]` | Import job status |
| GET | `/energy/scada/browse` | Browse SCADA file directory |
| GET | `/energy/scada/scan` | Scan for new SCADA files |
| GET | `/energy/scada/summary` | SCADA data summary |
| GET | `/energy/scada/comparison` | Turbine comparison |
| GET | `/energy/scada/power-curve` | Power curve data |
| GET | `/energy/scada/wind-rose` | Wind rose diagram data |
| GET | `/energy/scada/preview` | Preview parsed file data |
| GET | `/energy/scada/productions` | SCADA-derived productions |
| GET | `/energy/scada/mappings` | Plant-to-turbine mappings |
| POST | `/energy/scada/mappings` | Create mapping |
| GET | `/energy/scada/mappings/unmatched` | Unmatched SCADA plants |
| GET | `/energy/scada/anomalies` | Detected anomalies |
| GET | `/energy/scada/anomalies/config` | Anomaly detection config |
| GET | `/energy/scada/auto-import` | Auto-import settings |
| GET | `/energy/scada/auto-import/logs` | Import log history |

### SCADA n8n Integration (API Key Auth)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/energy/scada/n8n/upload` | Bearer token | Upload SCADA files from external script |
| POST | `/energy/scada/n8n/trigger` | Bearer token | Trigger SCADA import processing |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/energy/analytics/availability` | Availability (IEC 61400-26) |
| GET | `/energy/analytics/availability-detail` | Availability drill-down |
| GET | `/energy/analytics/performance` | Performance KPIs |
| GET | `/energy/analytics/degradation` | Predictive maintenance / degradation |
| GET | `/energy/analytics/faults` | Fault analysis |
| GET | `/energy/analytics/faults/events` | Fault event log |
| GET | `/energy/analytics/daily-overview` | Daily production snapshot |
| GET | `/energy/analytics/turbine-comparison` | Turbine-to-turbine comparison |
| GET | `/energy/analytics/operating-states` | Operating state distribution |
| GET | `/energy/analytics/phase-symmetry` | Phase symmetry analysis |
| GET | `/energy/analytics/shadow` | Shadow casting calculation |
| GET | `/energy/analytics/environment` | Environmental data |
| GET | `/energy/analytics/financial` | Financial KPIs |
| GET | `/energy/analytics/market-comparison` | Day-ahead vs. EEG comparison |

### Topology & Market

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/energy/topology` | Network topology |
| POST | `/energy/topology/auto-generate` | Auto-generate topology |
| GET | `/energy/market-prices` | Market price data |
| POST | `/energy/market-prices/sync` | Sync from SMARD API |
| GET | `/energy/revenue-types` | Revenue type catalog |

### Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/energy/reports/generate` | Generate energy report |
| POST | `/energy/reports/investor-quarterly` | Investor quarterly PDF |
| GET | `/energy/reports/configs` | Report template configs |
| GET | `/energy/reports/configs/[id]` | Specific config |

---

## Weather

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/weather/[parkId]` | Current weather for park location |
| GET | `/weather/[parkId]/forecast` | 7-day forecast (Open-Meteo) |
| GET | `/weather/[parkId]/history` | Historical weather data |

---

## PPA (Power Purchase Agreements)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ppa` | List PPAs |
| POST | `/ppa` | Create PPA |
| GET | `/ppa/[id]` | Get PPA details |
| PATCH | `/ppa/[id]` | Update PPA |
| DELETE | `/ppa/[id]` | Delete PPA |

---

## GIS (Geoinformationssystem)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/gis/features` | All GIS features (GeoJSON) |
| GET | `/gis/annotations` | Map annotations |
| POST | `/gis/annotations` | Create annotation |
| PUT | `/gis/annotations/[id]` | Update annotation |
| DELETE | `/gis/annotations/[id]` | Delete annotation |
| GET | `/gis/area-report` | Area report (Flaechenreport) |
| POST | `/gis/import/preview` | Preview Shapefile/QGIS import |
| POST | `/gis/import/confirm` | Confirm and execute import |

---

## Buchhaltung (Accounting)

### Chart of Accounts & Bookings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/buchhaltung/accounts` | SKR03 chart of accounts |
| GET | `/buchhaltung/accounts/[id]` | Account details |
| GET | `/journal-entries` | List journal entries |
| POST | `/journal-entries` | Create journal entry |
| POST | `/journal-entries/[id]/post` | Post entry (finalize) |

### Financial Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/buchhaltung/susa` | SuSa (Summen & Salden) |
| GET | `/buchhaltung/bwa` | BWA (Betriebswirtschaftliche Auswertung) |
| GET | `/buchhaltung/ustva` | UStVA (Umsatzsteuer-Voranmeldung) |
| GET | `/buchhaltung/euer` | EUER (Einnahmen-Ueberschuss-Rechnung) |
| GET | `/buchhaltung/guv` | GuV (Gewinn- und Verlustrechnung) |
| GET | `/buchhaltung/datev` | DATEV export |
| GET | `/buchhaltung/kostenstellen` | Cost center report |
| GET | `/buchhaltung/budget-vergleich` | Budget vs. actual |
| GET | `/buchhaltung/liquiditaet` | Liquidity planning / forecast |
| GET | `/buchhaltung/kassenbuch` | Cash book |

### Banking

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/buchhaltung/bank/accounts` | Bank accounts |
| POST | `/buchhaltung/bank/accounts` | Add bank account |
| POST | `/buchhaltung/bank/import` | CSV bank import |
| GET | `/buchhaltung/bank/transactions` | Bank transactions |

### Assets & Dunning

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/buchhaltung/assets` | Fixed assets (AfA) |
| POST | `/buchhaltung/assets` | Create asset |
| GET | `/buchhaltung/dunning` | Dunning runs (Mahnwesen) |
| POST | `/buchhaltung/dunning` | Create dunning run |
| GET | `/buchhaltung/sepa` | SEPA XML exports |
| POST | `/buchhaltung/sepa` | Generate SEPA file |

### Quotes (Angebote)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/buchhaltung/angebote` | List quotes |
| POST | `/buchhaltung/angebote` | Create quote |
| GET | `/buchhaltung/angebote/[id]` | Get quote |
| POST | `/buchhaltung/angebote/[id]/send` | Send quote to customer |
| POST | `/buchhaltung/angebote/[id]/accept` | Accept quote |
| POST | `/buchhaltung/angebote/[id]/convert` | Convert quote to invoice |
| POST | `/buchhaltung/angebote/[id]/cancel` | Cancel quote |

### EU Sales / ZM

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/buchhaltung/zm` | ZM/EC sales list data |
| GET | `/buchhaltung/zm/xml` | BZSt XML export |

---

## Inbox (Eingangsrechnungen)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/inbox` | List incoming invoices |
| POST | `/inbox` | Upload incoming invoice |
| GET | `/inbox/[id]` | Get incoming invoice |
| PATCH | `/inbox/[id]` | Update metadata |
| POST | `/inbox/[id]/ocr` | Trigger/re-trigger OCR |
| POST | `/inbox/[id]/approve` | Approve invoice |
| POST | `/inbox/[id]/pay` | Mark as paid |
| POST | `/inbox/[id]/generate-invoices` | Generate journal entries |
| GET | `/inbox/[id]/splits` | Split booking details |
| GET | `/inbox/export/datev` | DATEV export |
| GET | `/inbox/export/sepa` | SEPA payment file |

---

## CRM

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/crm/contacts` | List contacts |
| POST | `/crm/contacts` | Create contact |
| GET | `/crm/contacts/[id]` | Get contact |
| PUT | `/crm/contacts/[id]` | Update contact |
| GET | `/crm/activities` | List activities |
| POST | `/crm/activities` | Create activity |
| GET | `/crm/dashboard` | CRM dashboard metrics |

---

## Shareholders (Gesellschafter)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/shareholders` | List shareholders |
| POST | `/shareholders` | Create shareholder |
| GET | `/shareholders/[id]` | Get shareholder |
| PUT | `/shareholders/[id]` | Update shareholder |
| POST | `/shareholders/[id]/portal-access` | Grant/revoke portal access |
| POST | `/shareholders/onboard` | Onboard new shareholder |

---

## Portal (Gesellschafter-Selbstbedienung)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/portal/my-profile` | Current user's profile |
| GET | `/portal/my-participations` | Fund participations |
| GET | `/portal/my-distributions` | Distribution history |
| GET | `/portal/my-documents` | Personal documents |
| GET | `/portal/my-reports` | Available reports |
| GET | `/portal/my-reports/[id]/download` | Download report PDF |
| GET | `/portal/my-permissions` | Current permissions |
| GET | `/portal/my-votes` | Voting records |
| GET | `/portal/my-proxies` | Power of attorney |
| GET | `/portal/energy-analytics` | Energy data (read-only) |
| GET | `/portal/energy-reports` | Energy report listing |
| POST | `/portal/my-data/export` | DSGVO Art. 15 data export |
| DELETE | `/portal/my-account/delete` | DSGVO Art. 17 account deletion |

---

## Mailings (Serienbriefe)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/mailings` | List mailings |
| POST | `/mailings` | Create mailing |
| GET | `/mailings/[id]` | Get mailing |
| GET | `/mailings/[id]/preview` | Preview mailing |
| POST | `/mailings/[id]/send` | Send mailing |
| GET | `/mailings/templates` | Mailing templates |

---

## Management Billing (BF-Abrechnung)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/management-billing/overview` | Overview dashboard |
| GET | `/management-billing/billings` | List billings |
| POST | `/management-billing/billings` | Create billing |
| POST | `/management-billing/billings/batch-calculate` | Batch calculation |
| POST | `/management-billing/billings/calculate-and-invoice` | Calculate + invoice in one step |
| GET | `/management-billing/billings/[id]/pdf` | Billing PDF |
| POST | `/management-billing/billings/[id]/create-invoice` | Generate invoice from billing |
| GET | `/management-billing/stakeholders` | Stakeholders |
| GET | `/management-billing/inspection-plans` | Inspection plans |
| GET | `/management-billing/inspection-reports` | Inspection reports |
| GET | `/management-billing/checklists` | Checklists |
| GET | `/management-billing/defects` | Defect tracking |
| GET | `/management-billing/tasks` | Task management |
| GET | `/management-billing/insurance-policies` | Insurance policies |
| GET | `/management-billing/insurance-claims` | Insurance claims |
| GET | `/management-billing/available-parks` | Available parks for billing |
| GET | `/management-billing/available-funds` | Available funds for billing |

---

## Wirtschaftsplan (Business Plan)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/wirtschaftsplan/overview` | P&L overview |
| GET | `/wirtschaftsplan/pl` | Profit & loss statement |
| GET | `/wirtschaftsplan/budgets` | List budgets |
| POST | `/wirtschaftsplan/budgets` | Create budget |
| GET | `/wirtschaftsplan/budgets/[id]` | Budget details |
| GET | `/wirtschaftsplan/budgets/[id]/lines` | Budget line items |

---

## Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/reports` | List available reports |
| GET | `/reports/[type]` | Generate report by type |
| GET | `/reports/monthly` | Monthly report |
| GET | `/reports/quarterly` | Quarterly report |
| GET | `/reports/annual` | Annual report |
| GET | `/reports/park-pl` | Park P&L report |
| POST | `/reports/custom` | Custom report generation |
| GET | `/reports/archive` | Archived reports |
| GET | `/reports/archive/[id]` | Download archived report |

---

## Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/quick-search?q=term` | Fast entity search (parks, funds, contracts, ...) |
| GET | `/search?q=term` | Full-text search |

---

## Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/notifications` | List notifications |
| PATCH | `/notifications/[id]` | Mark notification as read |
| POST | `/notifications/mark-all-read` | Mark all as read |
| GET | `/notifications/unread-count` | Unread count |

---

## Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard/stats` | Overview statistics |
| GET | `/dashboard/analytics` | Analytics data |
| GET | `/dashboard/activities` | Recent activities |
| GET | `/dashboard/deadlines` | Upcoming deadlines |
| GET | `/dashboard/expiring-contracts` | Expiring contracts |
| GET | `/dashboard/energy-kpis` | Energy KPI summary |
| GET | `/dashboard/weather` | Weather widget data |
| GET | `/dashboard/widgets` | Available widgets |

---

## User Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/user/settings` | User preferences |
| PUT | `/user/settings` | Update preferences |
| GET | `/user/dashboard-config` | Dashboard layout |
| PUT | `/user/dashboard-config` | Save dashboard layout |
| POST | `/user/dashboard-config/reset` | Reset to default |
| PUT | `/user/password` | Change password |
| POST | `/user/avatar` | Upload avatar |
| GET | `/user/email-preferences` | Email notification settings |
| PUT | `/user/email-preferences` | Update email preferences |
| POST | `/user/onboarding` | Update onboarding state |
| PUT | `/user/sidebar-order` | Custom sidebar order |
| POST | `/user/switch-tenant` | Switch active tenant |
| GET | `/user/tenants` | List user's tenants |

---

## Admin

### Users & Roles

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/users` | List users |
| POST | `/admin/users` | Create user |
| GET | `/admin/users/[id]` | Get user |
| PUT | `/admin/users/[id]` | Update user |
| DELETE | `/admin/users/[id]` | Delete user |
| PUT | `/admin/users/[id]/roles` | Assign roles |
| GET | `/admin/roles` | List roles |
| POST | `/admin/roles` | Create role |
| GET | `/admin/permissions` | List permissions |
| GET | `/admin/permissions/export` | Export permission matrix |
| POST | `/admin/impersonate` | Impersonate user (superadmin) |

### Tenants

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/tenants` | List tenants |
| POST | `/admin/tenants` | Create tenant |
| GET | `/admin/tenants/[id]` | Get tenant |
| PUT | `/admin/tenants/[id]` | Update tenant |
| GET | `/admin/tenant-limits` | Tenant resource limits |
| GET | `/admin/tenant-settings` | Tenant-level settings |

### Feature Flags & Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/feature-flags` | List feature flags |
| PUT | `/admin/feature-flags/[tenantId]` | Update flags for tenant |
| GET | `/admin/features` | Feature catalog |
| GET | `/admin/settings` | Global settings |
| PUT | `/admin/settings` | Update settings |
| GET | `/admin/settings/thresholds` | Alert thresholds |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check (public, no auth) |
| GET | `/admin/system/status` | System status dashboard |
| GET | `/admin/system/stats` | System statistics |
| GET | `/admin/monitoring` | Monitoring metrics |
| GET | `/admin/metrics` | Prometheus metrics |
| GET | `/admin/version` | Application version |
| GET | `/admin/onboarding-status` | Onboarding progress |
| GET | `/admin/cache` | Cache management |
| DELETE | `/admin/cache` | Clear cache |
| GET | `/admin/storage` | Storage usage |
| POST | `/admin/backup` | Trigger backup |
| POST | `/admin/maintenance` | Maintenance mode toggle |

### Audit & Compliance

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/audit-logs` | Audit log entries |
| GET | `/admin/audit-logs/export` | Export audit log |
| GET | `/admin/access-report` | Access report |
| GET | `/admin/access-report/pdf` | Access report PDF |
| GET | `/admin/archive` | GoBD archive |
| GET | `/admin/archive/[id]` | Archived item |
| GET | `/admin/archive/export` | Export archive |
| POST | `/admin/archive/verify` | Verify archive integrity |

### Email & Communication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/admin/email` | Send email |
| POST | `/admin/email/test` | Test email config |
| GET | `/admin/email-templates` | Email templates |
| PUT | `/admin/email-templates/[key]` | Update email template |
| GET | `/admin/email-templates/[key]/preview` | Preview template |
| POST | `/admin/mass-communication` | Mass email/letter |
| GET | `/admin/mass-communication/preview` | Preview mass communication |
| PUT | `/admin/tenant-email` | Fund-specific SMTP config |
| POST | `/admin/tenant-email/test` | Test fund SMTP |

### Templates & Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/invoice-templates` | Invoice templates |
| GET | `/admin/document-templates` | Document templates |
| GET | `/admin/position-templates` | Position templates |
| GET | `/admin/letterheads` | Letterheads |
| GET | `/admin/invoice-sequences` | Invoice numbering |
| GET | `/admin/tax-rates` | Tax rates |
| GET | `/admin/revenue-types` | Revenue types |
| GET | `/admin/fund-categories` | Fund categories |
| GET | `/admin/billing-rules` | Billing rules |
| GET | `/admin/recurring-invoices` | Recurring invoices |
| GET | `/admin/settlement-periods` | Settlement periods |
| GET | `/admin/energy-monthly-rates` | Energy monthly rates |
| GET | `/admin/energy-revenue-types` | Energy revenue types |
| GET | `/admin/scada-codes` | SCADA status codes |
| POST | `/admin/scada-codes/import` | Import SCADA codes |

### Webhooks & Integrations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/webhooks` | List webhooks |
| POST | `/admin/webhooks` | Create webhook |
| GET | `/admin/webhooks/stats` | Webhook delivery stats |
| POST | `/admin/webhooks/[id]/test` | Test webhook |
| GET | `/admin/webhooks/[id]/deliveries` | Delivery log |

### Jobs & Scheduling

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/jobs` | Background jobs |
| GET | `/admin/jobs/stats` | Job statistics |
| POST | `/admin/jobs/[id]/retry` | Retry failed job |
| GET | `/admin/scheduled-reports` | Scheduled reports |
| POST | `/admin/search/reindex` | Trigger search reindex |

### Other Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/sidebar-links` | Custom sidebar links |
| POST | `/admin/sidebar-links` | Create sidebar link |
| GET | `/admin/translations` | Translation overrides |
| PUT | `/admin/translations` | Update translations |
| GET | `/admin/marketing-config` | Marketing/landing config |
| POST | `/admin/marketing-video` | Upload marketing video |
| GET | `/admin/widget-visibility` | Dashboard widget visibility per role |
| PUT | `/admin/widget-visibility` | Update widget visibility |
| POST | `/admin/contracts/auto-renew` | Auto-renew expiring contracts |
| GET | `/admin/document-routing` | Document routing rules |
| GET | `/admin/resource-access` | Resource access matrix |
| GET | `/admin/legal-pages` | Legal pages content |
| GET | `/admin/system-config` | System configuration |

---

## Integrations

### Paperless-ngx

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/integrations/paperless/documents` | List Paperless documents |
| GET | `/integrations/paperless/documents/[id]` | Get document |
| GET | `/integrations/paperless/documents/[id]/download` | Download document |
| GET | `/integrations/paperless/documents/[id]/preview` | Preview document |
| GET | `/integrations/paperless/metadata` | Paperless metadata (tags, correspondents) |
| POST | `/integrations/paperless/sync` | Trigger sync |
| GET | `/integrations/paperless/sync/status` | Sync status |
| GET | `/settings/paperless` | Paperless connection settings |
| POST | `/settings/paperless/test` | Test Paperless connection |

---

## Miscellaneous

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/upload` | Generic file upload |
| GET | `/export/[type]` | Export data (CSV/Excel) |
| GET | `/export/calendar` | iCal calendar export |
| POST | `/demo-request` | Demo request form (public) |
| GET | `/deadlines` | Upcoming deadlines |
| GET | `/reminders/pending` | Pending reminders |
| GET | `/fund-categories` | Fund category catalog |
| GET | `/cost-centers` | Cost centers |
| POST | `/cost-centers/sync` | Sync cost centers |
| GET | `/features` | Feature flags (current tenant) |
| GET | `/sidebar-links` | Sidebar links (current tenant) |
| GET | `/marketing-config` | Marketing config (public) |
| GET | `/metrics` | Application metrics |
| GET | `/persons` | Person records |
| GET | `/vendors` | Vendor records |
| GET | `/vendors/search` | Search vendors |
| GET | `/news` | News articles |
| GET | `/service-events` | Service events |
| GET | `/votes` | Voting sessions |
| GET | `/proxies` | Power of attorney records |

### Batch Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/batch/documents` | Batch document operations |
| POST | `/batch/email` | Batch email send |
| POST | `/batch/invoices` | Batch invoice operations |
| POST | `/batch/settlements` | Batch settlement operations |

### Technician Check-In (Token Auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/techniker/[token]` | Get work order by QR token |
| POST | `/techniker/[token]/check-in` | Technician check-in |
| POST | `/techniker/[token]/check-out` | Technician check-out |

---

## Rate Limiting

| Scope | Limit |
|-------|-------|
| Authenticated endpoints | 100 requests/minute per user |
| Auth endpoints | 5 requests/15 minutes per IP |
| Upload endpoints | 20 requests/minute |
| SCADA n8n endpoints | 60 requests/minute per API key |

---

## Response Format

All endpoints return JSON in the following structure:

```json
{
  "data": { ... },
  "error": "Error message (only on failure)",
  "details": { ... }
}
```

Paginated endpoints include:

```json
{
  "data": [ ... ],
  "total": 142,
  "page": 1,
  "pageSize": 20
}
```

Validation errors return Zod-formatted details:

```json
{
  "error": "Validation failed",
  "details": [
    { "path": ["name"], "message": "Required" }
  ]
}
```

---

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Invalid input (Zod validation) |
| 401 | Not authenticated |
| 403 | Permission denied (RBAC) |
| 404 | Not found |
| 409 | Conflict (duplicate, version mismatch) |
| 429 | Rate limit exceeded |
| 500 | Server error |
