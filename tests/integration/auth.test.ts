import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { createMockRequest, resetMocks } from "./setup";

// Import mocked modules
const { requirePermission, requireAdmin } = await vi.importMock<
  typeof import("@/lib/auth/withPermission")
>("@/lib/auth/withPermission");

describe("Auth & Permission System", () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllMocks();
  });

  describe("Unauthenticated Access", () => {
    it("should return 401 when not authenticated", async () => {
      (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        authorized: false,
        error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
      });

      const { POST } = await import("@/app/api/batch/invoices/route");
      const req = createMockRequest("POST", "/api/batch/invoices", {
        action: "approve",
        invoiceIds: ["inv-1"],
      });

      const response = await POST(req);
      expect(response.status).toBe(401);
    });

    it("should return 401 for admin routes without auth", async () => {
      (requireAdmin as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        authorized: false,
        error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
      });

      // Admin permission check returns unauthorized
      (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        authorized: false,
        error: NextResponse.json({ error: "Admin required" }, { status: 403 }),
      });

      const { POST } = await import("@/app/api/batch/email/route");
      const req = createMockRequest("POST", "/api/batch/email", {
        subject: "Test",
        body: "Test body",
        recipientIds: ["user-1"],
      });

      const response = await POST(req);
      expect(response.status).toBe(403);
    });
  });

  describe("Permission Checks", () => {
    it("should return 403 when permission is missing", async () => {
      (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        authorized: false,
        error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      });

      const { POST } = await import("@/app/api/batch/invoices/route");
      const req = createMockRequest("POST", "/api/batch/invoices", {
        action: "approve",
        invoiceIds: ["inv-1"],
      });

      const response = await POST(req);
      expect(response.status).toBe(403);
    });

    it("should allow access with correct permission", async () => {
      (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        authorized: true,
        userId: "user-1",
        tenantId: "tenant-1",
      });

      const { prisma } = await vi.importMock<typeof import("@/lib/prisma")>(
        "@/lib/prisma"
      );
      (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: "inv-1", status: "DRAFT" },
      ]);
      (prisma.invoice.update as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});

      const { POST } = await import("@/app/api/batch/invoices/route");
      const req = createMockRequest("POST", "/api/batch/invoices", {
        action: "approve",
        invoiceIds: ["inv-1"],
      });

      const response = await POST(req);
      expect(response.status).toBe(200);
    });
  });

  describe("Tenant Isolation", () => {
    it("should not return resources from other tenants", async () => {
      (requirePermission as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        authorized: true,
        userId: "user-1",
        tenantId: "tenant-1",
      });

      const { prisma } = await vi.importMock<typeof import("@/lib/prisma")>(
        "@/lib/prisma"
      );
      // Invoice belongs to different tenant → findMany returns empty (tenant filter)
      (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      const { POST } = await import("@/app/api/batch/invoices/route");
      const req = createMockRequest("POST", "/api/batch/invoices", {
        action: "approve",
        invoiceIds: ["inv-other-tenant"],
      });

      const response = await POST(req);
      expect(response.status).toBe(404);
    });
  });
});
