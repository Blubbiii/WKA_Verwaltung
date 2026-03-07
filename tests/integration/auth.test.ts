import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { createMockRequest, mockPrisma, resetMocks } from "./setup";
import { requirePermission, requireAdmin } from "@/lib/auth/withPermission";

const UUID1 = "550e8400-e29b-41d4-a716-446655440001";
const UUID2 = "550e8400-e29b-41d4-a716-446655440002";

describe("Auth & Permission System", () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllMocks();
  });

  describe("Unauthenticated Access", () => {
    it("should return 401 when not authenticated", async () => {
      vi.mocked(requirePermission).mockResolvedValueOnce({
        authorized: false,
        error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
      } as never);

      const { POST } = await import("@/app/api/batch/invoices/route");
      const req = createMockRequest("POST", "/api/batch/invoices", {
        action: "approve",
        invoiceIds: [UUID1],
      });

      const response = await POST(req);
      expect(response.status).toBe(401);
    });

    it("should return 401 for admin routes without auth", async () => {
      vi.mocked(requireAdmin).mockResolvedValueOnce({
        authorized: false,
        error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
      } as never);

      vi.mocked(requirePermission).mockResolvedValueOnce({
        authorized: false,
        error: NextResponse.json({ error: "Admin required" }, { status: 403 }),
      } as never);

      const { POST } = await import("@/app/api/batch/email/route");
      const req = createMockRequest("POST", "/api/batch/email", {
        subject: "Test",
        body: "Test body",
        recipientIds: [UUID1],
      });

      const response = await POST(req);
      expect(response.status).toBe(403);
    });
  });

  describe("Permission Checks", () => {
    it("should return 403 when permission is missing", async () => {
      vi.mocked(requirePermission).mockResolvedValueOnce({
        authorized: false,
        error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      } as never);

      const { POST } = await import("@/app/api/batch/invoices/route");
      const req = createMockRequest("POST", "/api/batch/invoices", {
        action: "approve",
        invoiceIds: [UUID1],
      });

      const response = await POST(req);
      expect(response.status).toBe(403);
    });

    it("should allow access with correct permission", async () => {
      vi.mocked(requirePermission).mockResolvedValueOnce({
        authorized: true,
        userId: "user-1",
        tenantId: "tenant-1",
      } as never);

      mockPrisma.invoice.findMany.mockResolvedValueOnce([
        { id: UUID1, status: "DRAFT" },
      ]);
      mockPrisma.invoice.update.mockResolvedValueOnce({});

      const { POST } = await import("@/app/api/batch/invoices/route");
      const req = createMockRequest("POST", "/api/batch/invoices", {
        action: "approve",
        invoiceIds: [UUID1],
      });

      const response = await POST(req);
      expect(response.status).toBe(200);
    });
  });

  describe("Tenant Isolation", () => {
    it("should return 404 for invoices not found in tenant", async () => {
      vi.mocked(requirePermission).mockResolvedValueOnce({
        authorized: true,
        userId: "user-1",
        tenantId: "tenant-1",
      } as never);

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
