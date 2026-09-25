/**
 * URL of the audit log export with the filters of the list.
 *
 * The list takes plain dates (yyyy-mm-dd), the export ISO date-times — the
 * end date is widened to the end of that day, as the list does it.
 * "ALL" is the list's value for "no filter".
 */
export interface AuditFilter {
  action: string;
  entityType: string;
  userId: string;
  startDate: string;
  endDate: string;
}

export function auditExportUrl(format: "csv" | "xlsx" | "pdf", filter: AuditFilter): string {
  const params = new URLSearchParams({ format });
  if (filter.action !== "ALL") params.set("action", filter.action);
  if (filter.entityType !== "ALL") params.set("entityType", filter.entityType);
  if (filter.userId !== "ALL") params.set("userId", filter.userId);
  if (filter.startDate) params.set("from", `${filter.startDate}T00:00:00.000Z`);
  if (filter.endDate) params.set("to", `${filter.endDate}T23:59:59.999Z`);
  return `/api/admin/audit-logs/export?${params.toString()}`;
}
