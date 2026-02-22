import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequest, resetMocks } from "./setup";

const { requirePermission } = await vi.importMock<
  typeof import("@/lib/auth/withPermission")
>("@/lib/auth/withPermission");

const { prisma } = await vi.importMock<typeof import("@/lib/prisma")>(
  "@/lib/prisma"
);

describe("Batch Settlement API", () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllMocks();
    (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValue({
      authorized: true,
      userId: "user-1",
      tenantId: "tenant-1",
    });
  });

  describe("POST /api/batch/settlements - Approve", () => {
    it("should approve CALCULATED settlements", async () => {
      (prisma.energySettlement.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: "s-1", status: "CALCULATED", park: { tenantId: "tenant-1" } },
        { id: "s-2", status: "CALCULATED", park: { tenantId: "tenant-1" } },
      ]);
      (prisma.energySettlement.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const { POST } = await import("@/app/api/batch/settlements/route");
      const req = createMockRequest("POST", "/api/batch/settlements", {
        action: "approve",
        settlementIds: ["s-1", "s-2"],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toHaveLength(2);
      expect(body.failed).toHaveLength(0);
    });

    it("should fail for DRAFT settlements", async () => {
      (prisma.energySettlement.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: "s-1", status: "DRAFT", park: { tenantId: "tenant-1" } },
      ]);

      const { POST } = await import("@/app/api/batch/settlements/route");
      const req = createMockRequest("POST", "/api/batch/settlements", {
        action: "approve",
        settlementIds: ["s-1"],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(body.failed).toHaveLength(1);
      expect(body.failed[0].error).toContain("DRAFT");
    });
  });

  describe("POST /api/batch/settlements - Reject", () => {
    it("should reject CALCULATED settlements with reason", async () => {
      (prisma.energySettlement.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: "s-1", status: "CALCULATED", park: { tenantId: "tenant-1" } },
      ]);
      (prisma.energySettlement.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const { POST } = await import("@/app/api/batch/settlements/route");
      const req = createMockRequest("POST", "/api/batch/settlements", {
        action: "reject",
        settlementIds: ["s-1"],
        reason: "Werte fehlerhaft",
      });

      const response = await POST(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toHaveLength(1);
    });

    it("should fail for CLOSED settlements", async () => {
      (prisma.energySettlement.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: "s-1", status: "CLOSED", park: { tenantId: "tenant-1" } },
      ]);

      const { POST } = await import("@/app/api/batch/settlements/route");
      const req = createMockRequest("POST", "/api/batch/settlements", {
        action: "reject",
        settlementIds: ["s-1"],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(body.failed).toHaveLength(1);
    });
  });

  describe("Tenant Isolation", () => {
    it("should reject settlements from other tenants", async () => {
      (prisma.energySettlement.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: "s-1", status: "CALCULATED", park: { tenantId: "other-tenant" } },
      ]);

      const { POST } = await import("@/app/api/batch/settlements/route");
      const req = createMockRequest("POST", "/api/batch/settlements", {
        action: "approve",
        settlementIds: ["s-1"],
      });

      const response = await POST(req);
      expect(response.status).toBe(403);
    });
  });
});
