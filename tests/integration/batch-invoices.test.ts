import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequest, resetMocks } from "./setup";
import { createMockInvoice } from "./helpers";

const { requirePermission } = await vi.importMock<
  typeof import("@/lib/auth/withPermission")
>("@/lib/auth/withPermission");

const { prisma } = await vi.importMock<typeof import("@/lib/prisma")>(
  "@/lib/prisma"
);

describe("Batch Invoice API", () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllMocks();
    (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValue({
      authorized: true,
      userId: "user-1",
      tenantId: "tenant-1",
    });
  });

  describe("POST /api/batch/invoices - Approve", () => {
    it("should approve multiple DRAFT invoices", async () => {
      const invoices = [
        createMockInvoice({ id: "inv-1", status: "DRAFT" }),
        createMockInvoice({ id: "inv-2", status: "DRAFT" }),
      ];
      (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        invoices.map((i) => ({ id: i.id, status: i.status }))
      );
      (prisma.invoice.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const { POST } = await import("@/app/api/batch/invoices/route");
      const req = createMockRequest("POST", "/api/batch/invoices", {
        action: "approve",
        invoiceIds: ["inv-1", "inv-2"],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toHaveLength(2);
      expect(body.failed).toHaveLength(0);
    });

    it("should fail for non-DRAFT invoices", async () => {
      (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: "inv-1", status: "SENT" },
      ]);

      const { POST } = await import("@/app/api/batch/invoices/route");
      const req = createMockRequest("POST", "/api/batch/invoices", {
        action: "approve",
        invoiceIds: ["inv-1"],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toHaveLength(0);
      expect(body.failed).toHaveLength(1);
      expect(body.failed[0].error).toContain("SENT");
    });

    it("should handle partial success", async () => {
      (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: "inv-1", status: "DRAFT" },
        { id: "inv-2", status: "PAID" },
      ]);
      (prisma.invoice.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const { POST } = await import("@/app/api/batch/invoices/route");
      const req = createMockRequest("POST", "/api/batch/invoices", {
        action: "approve",
        invoiceIds: ["inv-1", "inv-2"],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toHaveLength(1);
      expect(body.failed).toHaveLength(1);
    });
  });

  describe("POST /api/batch/invoices - Cancel", () => {
    it("should cancel invoices", async () => {
      (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: "inv-1", status: "SENT" },
      ]);
      (prisma.invoice.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const { POST } = await import("@/app/api/batch/invoices/route");
      const req = createMockRequest("POST", "/api/batch/invoices", {
        action: "cancel",
        invoiceIds: ["inv-1"],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toHaveLength(1);
    });

    it("should fail for already cancelled invoices", async () => {
      (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: "inv-1", status: "CANCELLED" },
      ]);

      const { POST } = await import("@/app/api/batch/invoices/route");
      const req = createMockRequest("POST", "/api/batch/invoices", {
        action: "cancel",
        invoiceIds: ["inv-1"],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(body.failed).toHaveLength(1);
      expect(body.failed[0].error).toContain("bereits storniert");
    });
  });

  describe("Validation", () => {
    it("should reject invalid action", async () => {
      const { POST } = await import("@/app/api/batch/invoices/route");
      const req = createMockRequest("POST", "/api/batch/invoices", {
        action: "invalid",
        invoiceIds: ["inv-1"],
      });

      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it("should reject empty invoiceIds", async () => {
      const { POST } = await import("@/app/api/batch/invoices/route");
      const req = createMockRequest("POST", "/api/batch/invoices", {
        action: "approve",
        invoiceIds: [],
      });

      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it("should reject non-UUID ids", async () => {
      const { POST } = await import("@/app/api/batch/invoices/route");
      const req = createMockRequest("POST", "/api/batch/invoices", {
        action: "approve",
        invoiceIds: ["not-a-uuid"],
      });

      const response = await POST(req);
      expect(response.status).toBe(400);
    });
  });

  describe("Not Found", () => {
    it("should return 404 for non-existent invoices", async () => {
      (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      const { POST } = await import("@/app/api/batch/invoices/route");
      const req = createMockRequest("POST", "/api/batch/invoices", {
        action: "approve",
        invoiceIds: ["550e8400-e29b-41d4-a716-446655440000"],
      });

      const response = await POST(req);
      expect(response.status).toBe(404);
    });
  });
});
