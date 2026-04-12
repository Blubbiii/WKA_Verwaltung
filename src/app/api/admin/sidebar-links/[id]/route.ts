import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";
import { apiError } from "@/lib/api-errors";

const updateSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  url: z.url().optional(),
  icon: z.string().optional(),
  description: z.string().max(255).nullish(),
  openInNewTab: z.boolean().optional(),
  minHierarchy: z.number().int().min(0).max(100).optional(),
  sortOrder: z.number().int().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error!;

    const { id } = await params;
    const existing = await prisma.sidebarLink.findFirst({
      where: { id, tenantId: check.tenantId },
    });
    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Nicht gefunden" });
    }

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const firstError =
        Object.values(fieldErrors).flat()[0] ??
        parsed.error.flatten().formErrors[0] ??
        "Ungültige Eingabe";
      return apiError("BAD_REQUEST", undefined, { message: firstError });
    }

    const link = await prisma.sidebarLink.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json(link);
  } catch (error) {
    logger.error({ error }, "[sidebar-links] PATCH error");
    return apiError("INTERNAL_ERROR", undefined, { message: "Interner Serverfehler" });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const check = await requireAdmin();
    if (!check.authorized) return check.error!;

    const { id } = await params;
    const existing = await prisma.sidebarLink.findFirst({
      where: { id, tenantId: check.tenantId },
    });
    if (!existing) {
      return apiError("NOT_FOUND", undefined, { message: "Nicht gefunden" });
    }

    await prisma.sidebarLink.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error({ error }, "[sidebar-links] DELETE error");
    return apiError("INTERNAL_ERROR", undefined, { message: "Interner Serverfehler" });
  }
}
