import { describe, expect, it } from "vitest";
import { auditExportUrl } from "./export-url";

describe("Audit-Log-Export: die Filter der Liste gelten auch für die Datei", () => {
  it("ohne Filter nur das Format", () => {
    expect(
      auditExportUrl("csv", { action: "ALL", entityType: "ALL", userId: "ALL", startDate: "", endDate: "" }),
    ).toBe("/api/admin/audit-logs/export?format=csv");
  });

  it("Filter werden übernommen, Datumsangaben als ganzer Tag", () => {
    const url = new URL(
      auditExportUrl("xlsx", {
        action: "DELETE",
        entityType: "Invoice",
        userId: "11111111-1111-4111-8111-111111111111",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
      }),
      "http://x",
    );
    expect(url.searchParams.get("format")).toBe("xlsx");
    expect(url.searchParams.get("action")).toBe("DELETE");
    expect(url.searchParams.get("entityType")).toBe("Invoice");
    expect(url.searchParams.get("userId")).toBe("11111111-1111-4111-8111-111111111111");
    // The export expects ISO date-times; the end day counts completely.
    expect(url.searchParams.get("from")).toBe("2026-09-01T00:00:00.000Z");
    expect(url.searchParams.get("to")).toBe("2026-09-30T23:59:59.999Z");
  });
});
