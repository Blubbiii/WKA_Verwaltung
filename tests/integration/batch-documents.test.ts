import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequest, mockPrisma, resetMocks } from "./setup";
import { requirePermission } from "@/lib/auth/withPermission";

const UUID1 = "550e8400-e29b-41d4-a716-446655440001";
const UUID2 = "550e8400-e29b-41d4-a716-446655440002";

describe("Batch Document API", () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllMocks();
    vi.mocked(requirePermission).mockResolvedValue({
      authorized: true,
      userId: "user-1",
      tenantId: "tenant-1",
    } as never);
  });

  describe("POST /api/batch/documents - Approve", () => {
    it("should approve PENDING_REVIEW documents", async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([
        { id: UUID1, approvalStatus: "PENDING_REVIEW", isArchived: false },
        { id: UUID2, approvalStatus: "PENDING_REVIEW", isArchived: false },
      ]);
      mockPrisma.document.update.mockResolvedValue({});

      const { POST } = await import("@/app/api/batch/documents/route");
      const req = createMockRequest("POST", "/api/batch/documents", {
        action: "approve",
        documentIds: [UUID1, UUID2],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toHaveLength(2);
      expect(body.failed).toHaveLength(0);
    });

    it("should fail for DRAFT documents", async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([
        { id: UUID1, approvalStatus: "DRAFT", isArchived: false },
      ]);

      const { POST } = await import("@/app/api/batch/documents/route");
      const req = createMockRequest("POST", "/api/batch/documents", {
        action: "approve",
        documentIds: [UUID1],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(body.failed).toHaveLength(1);
      expect(body.failed[0].error).toContain("DRAFT");
    });
  });

  describe("POST /api/batch/documents - Publish", () => {
    it("should publish APPROVED documents", async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([
        { id: UUID1, approvalStatus: "APPROVED", isArchived: false },
      ]);
      mockPrisma.document.update.mockResolvedValue({});

      const { POST } = await import("@/app/api/batch/documents/route");
      const req = createMockRequest("POST", "/api/batch/documents", {
        action: "publish",
        documentIds: [UUID1],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toHaveLength(1);
    });
  });

  describe("POST /api/batch/documents - Archive", () => {
    it("should archive non-archived documents", async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([
        { id: UUID1, approvalStatus: "PUBLISHED", isArchived: false },
      ]);
      mockPrisma.document.update.mockResolvedValue({});

      const { POST } = await import("@/app/api/batch/documents/route");
      const req = createMockRequest("POST", "/api/batch/documents", {
        action: "archive",
        documentIds: [UUID1],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(body.success).toHaveLength(1);
    });

    it("should fail for already archived documents", async () => {
      mockPrisma.document.findMany.mockResolvedValueOnce([
        { id: UUID1, approvalStatus: "PUBLISHED", isArchived: true },
      ]);

      const { POST } = await import("@/app/api/batch/documents/route");
      const req = createMockRequest("POST", "/api/batch/documents", {
        action: "archive",
        documentIds: [UUID1],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(body.failed).toHaveLength(1);
      expect(body.failed[0].error).toContain("bereits archiviert");
    });
  });

  describe("POST /api/batch/documents - Delete", () => {
    it("should delete DRAFT documents", async () => {
      // Two permission checks: documents:update then documents:delete
      vi.mocked(requirePermission)
        .mockResolvedValueOnce({
          authorized: true, userId: "user-1", tenantId: "tenant-1",
        } as never)
        .mockResolvedValueOnce({
          authorized: true, userId: "user-1", tenantId: "tenant-1",
        } as never);

      mockPrisma.document.findMany.mockResolvedValueOnce([
        { id: UUID1, approvalStatus: "DRAFT", isArchived: false },
      ]);
      mockPrisma.document.delete.mockResolvedValue({});

      const { POST } = await import("@/app/api/batch/documents/route");
      const req = createMockRequest("POST", "/api/batch/documents", {
        action: "delete",
        documentIds: [UUID1],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(body.success).toHaveLength(1);
    });

    it("should fail for APPROVED documents", async () => {
      // Two permission checks: documents:update then documents:delete
      vi.mocked(requirePermission)
        .mockResolvedValueOnce({
          authorized: true, userId: "user-1", tenantId: "tenant-1",
        } as never)
        .mockResolvedValueOnce({
          authorized: true, userId: "user-1", tenantId: "tenant-1",
        } as never);

      mockPrisma.document.findMany.mockResolvedValueOnce([
        { id: UUID1, approvalStatus: "APPROVED", isArchived: false },
      ]);

      const { POST } = await import("@/app/api/batch/documents/route");
      const req = createMockRequest("POST", "/api/batch/documents", {
        action: "delete",
        documentIds: [UUID1],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(body.failed).toHaveLength(1);
      expect(body.failed[0].error).toContain("APPROVED");
    });
  });
});
