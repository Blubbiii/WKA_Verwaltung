import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockRequest, mockPrisma, resetMocks } from "./setup";
import { requirePermission } from "@/lib/auth/withPermission";
import { createMockInvoice } from "./helpers";

const UUID1 = "550e8400-e29b-41d4-a716-446655440001";
const UUID2 = "550e8400-e29b-41d4-a716-446655440002";

describe("Batch Invoice API", () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllMocks();
    vi.mocked(requirePermission).mockResolvedValue({
      authorized: true,
      userId: "user-1",
      tenantId: "tenant-1",
    } as never);
  });

  describe("POST /api/batch/invoices - Approve", () => {
    it("should approve multiple DRAFT invoices", async () => {
      const invoices = [
        createMockInvoice({ id: UUID1, status: "DRAFT" }),
        createMockInvoice({ id: UUID2, status: "DRAFT" }),
      ];
      mockPrisma.invoice.findMany.mockResolvedValueOnce(
        invoices.map((i) => ({ id: i.id, status: i.status }))
      );
      mockPrisma.invoice.update.mockResolvedValue({});

      const { POST } = await import("@/app/api/batch/invoices/route");
      const req = createMockRequest("POST", "/api/batch/invoices", {
        action: "approve",
        invoiceIds: [UUID1, UUID2],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toHaveLength(2);
      expect(body.failed).toHaveLength(0);
    });

    it("should fail for non-DRAFT invoices", async () => {
      mockPrisma.invoice.findMany.mockResolvedValueOnce([
        { id: UUID1, status: "SENT" },
      ]);

      const { POST } = await import("@/app/api/batch/invoices/route");
      const req = createMockRequest("POST", "/api/batch/invoices", {
        action: "approve",
        invoiceIds: [UUID1],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toHaveLength(0);
      expect(body.failed).toHaveLength(1);
      expect(body.failed[0].error).toContain("SENT");
    });

    it("should handle partial success", async () => {
      mockPrisma.invoice.findMany.mockResolvedValueOnce([
        { id: UUID1, status: "DRAFT" },
        { id: UUID2, status: "PAID" },
      ]);
      mockPrisma.invoice.update.mockResolvedValue({});

      const { POST } = await import("@/app/api/batch/invoices/route");
      const req = createMockRequest("POST", "/api/batch/invoices", {
        action: "approve",
        invoiceIds: [UUID1, UUID2],
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
      mockPrisma.invoice.findMany.mockResolvedValueOnce([
        { id: UUID1, status: "SENT" },
      ]);
      mockPrisma.invoice.update.mockResolvedValue({});

      const { POST } = await import("@/app/api/batch/invoices/route");
      const req = createMockRequest("POST", "/api/batch/invoices", {
        action: "cancel",
        invoiceIds: [UUID1],
      });

      const response = await POST(req);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toHaveLength(1);
    });

    it("should fail for already cancelled invoices", async () => {
      mockPrisma.invoice.findMany.mockResolvedValueOnce([
        { id: UUID1, status: "CANCELLED" },
      ]);

      const { POST } = await import("@/app/api/batch/invoices/route");
      const req = createMockRequest("POST", "/api/batch/invoices", {
        action: "cancel",
        invoiceIds: [UUID1],
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
        invoiceIds: [UUID1],
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
      mockPrisma.invoice.findMany.mockResolvedValueOnce([]);

      const { POST } = await import("@/app/api/batch/invoices/route");
      const req = createMockRequest("POST", "/api/batch/invoices", {
        action: "approve",
        invoiceIds: [UUID1],
      });

      const response = await POST(req);
      expect(response.status).toBe(404);
    });
  });
});
