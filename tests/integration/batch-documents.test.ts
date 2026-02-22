import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequest, resetMocks } from "./setup";

const { requirePermission } = await vi.importMock<
  typeof import("@/lib/auth/withPermission")
>("@/lib/auth/withPermission");

const { prisma } = await vi.importMock<typeof import("@/lib/prisma")>(
  "@/lib/prisma"
);

describe("Batch Document API", () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllMocks();
    (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValue({
      authorized: true,
      userId: "user-1",
      tenantId: "tenant-1",
    });
  });

  describe("POST /api/batch/documents - Approve", () => {
    it("should approve PENDING_REVIEW documents", async () => {
      (prisma.document.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: "doc-1", approvalStatus: "PENDING_REVIEW", isArchived: false },
        { id: "doc-2", approvalStatus: "PENDING_REVIEW", isArchived: false },
      ]);
      (prisma.document.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const { POST } = await import("@/app/api/batch/documents/route");
      const req = createMockRequest("POST", "/api/batch/documents", {
        action: "approve",
        documentIds: ["doc-1", "doc-2"],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toHaveLength(2);
      expect(body.failed).toHaveLength(0);
    });

    it("should fail for DRAFT documents", async () => {
      (prisma.document.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: "doc-1", approvalStatus: "DRAFT", isArchived: false },
      ]);

      const { POST } = await import("@/app/api/batch/documents/route");
      const req = createMockRequest("POST", "/api/batch/documents", {
        action: "approve",
        documentIds: ["doc-1"],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(body.failed).toHaveLength(1);
      expect(body.failed[0].error).toContain("DRAFT");
    });
  });

  describe("POST /api/batch/documents - Publish", () => {
    it("should publish APPROVED documents", async () => {
      (prisma.document.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: "doc-1", approvalStatus: "APPROVED", isArchived: false },
      ]);
      (prisma.document.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const { POST } = await import("@/app/api/batch/documents/route");
      const req = createMockRequest("POST", "/api/batch/documents", {
        action: "publish",
        documentIds: ["doc-1"],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toHaveLength(1);
    });
  });

  describe("POST /api/batch/documents - Archive", () => {
    it("should archive non-archived documents", async () => {
      (prisma.document.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: "doc-1", approvalStatus: "PUBLISHED", isArchived: false },
      ]);
      (prisma.document.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const { POST } = await import("@/app/api/batch/documents/route");
      const req = createMockRequest("POST", "/api/batch/documents", {
        action: "archive",
        documentIds: ["doc-1"],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(body.success).toHaveLength(1);
    });

    it("should fail for already archived documents", async () => {
      (prisma.document.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: "doc-1", approvalStatus: "PUBLISHED", isArchived: true },
      ]);

      const { POST } = await import("@/app/api/batch/documents/route");
      const req = createMockRequest("POST", "/api/batch/documents", {
        action: "archive",
        documentIds: ["doc-1"],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(body.failed).toHaveLength(1);
      expect(body.failed[0].error).toContain("bereits archiviert");
    });
  });

  describe("POST /api/batch/documents - Delete", () => {
    it("should delete DRAFT documents", async () => {
      (prisma.document.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: "doc-1", approvalStatus: "DRAFT", isArchived: false },
      ]);
      (prisma.document.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const { POST } = await import("@/app/api/batch/documents/route");
      const req = createMockRequest("POST", "/api/batch/documents", {
        action: "delete",
        documentIds: ["doc-1"],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(body.success).toHaveLength(1);
    });

    it("should fail for APPROVED documents", async () => {
      (prisma.document.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: "doc-1", approvalStatus: "APPROVED", isArchived: false },
      ]);

      const { POST } = await import("@/app/api/batch/documents/route");
      const req = createMockRequest("POST", "/api/batch/documents", {
        action: "delete",
        documentIds: ["doc-1"],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(body.failed).toHaveLength(1);
      expect(body.failed[0].error).toContain("APPROVED");
    });
  });
});
