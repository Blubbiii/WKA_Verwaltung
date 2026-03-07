import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequest, mockPrisma, resetMocks } from "./setup";
import { requirePermission } from "@/lib/auth/withPermission";

const UUID1 = "550e8400-e29b-41d4-a716-446655440001";
const UUID2 = "550e8400-e29b-41d4-a716-446655440002";

describe("Batch Settlement API", () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllMocks();
    vi.mocked(requirePermission).mockResolvedValue({
      authorized: true,
      userId: "user-1",
      tenantId: "tenant-1",
    } as never);
  });

  describe("POST /api/batch/settlements - Approve", () => {
    it("should approve CALCULATED settlements", async () => {
      mockPrisma.energySettlement.findMany.mockResolvedValueOnce([
        { id: UUID1, status: "CALCULATED", park: { tenantId: "tenant-1" } },
        { id: UUID2, status: "CALCULATED", park: { tenantId: "tenant-1" } },
      ]);
      mockPrisma.energySettlement.update.mockResolvedValue({});

      const { POST } = await import("@/app/api/batch/settlements/route");
      const req = createMockRequest("POST", "/api/batch/settlements", {
        action: "approve",
        settlementIds: [UUID1, UUID2],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toHaveLength(2);
      expect(body.failed).toHaveLength(0);
    });

    it("should fail for DRAFT settlements", async () => {
      mockPrisma.energySettlement.findMany.mockResolvedValueOnce([
        { id: UUID1, status: "DRAFT", park: { tenantId: "tenant-1" } },
      ]);

      const { POST } = await import("@/app/api/batch/settlements/route");
      const req = createMockRequest("POST", "/api/batch/settlements", {
        action: "approve",
        settlementIds: [UUID1],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(body.failed).toHaveLength(1);
      expect(body.failed[0].error).toContain("DRAFT");
    });
  });

  describe("POST /api/batch/settlements - Reject", () => {
    it("should reject CALCULATED settlements with reason", async () => {
      mockPrisma.energySettlement.findMany.mockResolvedValueOnce([
        { id: UUID1, status: "CALCULATED", park: { tenantId: "tenant-1" } },
      ]);
      mockPrisma.energySettlement.update.mockResolvedValue({});

      const { POST } = await import("@/app/api/batch/settlements/route");
      const req = createMockRequest("POST", "/api/batch/settlements", {
        action: "reject",
        settlementIds: [UUID1],
        reason: "Werte fehlerhaft",
      });

      const response = await POST(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toHaveLength(1);
    });

    it("should fail for CLOSED settlements", async () => {
      mockPrisma.energySettlement.findMany.mockResolvedValueOnce([
        { id: UUID1, status: "CLOSED", park: { tenantId: "tenant-1" } },
      ]);

      const { POST } = await import("@/app/api/batch/settlements/route");
      const req = createMockRequest("POST", "/api/batch/settlements", {
        action: "reject",
        settlementIds: [UUID1],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(body.failed).toHaveLength(1);
    });
  });

  describe("Tenant Isolation", () => {
    it("should reject settlements from other tenants", async () => {
      mockPrisma.energySettlement.findMany.mockResolvedValueOnce([
        { id: UUID1, status: "CALCULATED", park: { tenantId: "other-tenant" } },
      ]);

      const { POST } = await import("@/app/api/batch/settlements/route");
      const req = createMockRequest("POST", "/api/batch/settlements", {
        action: "approve",
        settlementIds: [UUID1],
      });

      const response = await POST(req);
      expect(response.status).toBe(403);
    });
  });
});
