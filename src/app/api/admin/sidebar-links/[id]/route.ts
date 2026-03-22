import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";

const updateSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
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
  const check = await requireAdmin();
  if (!check.authorized) return check.error!;

  const { id } = await params;
  const existing = await prisma.sidebarLink.findFirst({
    where: { id, tenantId: check.tenantId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const link = await prisma.sidebarLink.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json(link);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const check = await requireAdmin();
  if (!check.authorized) return check.error!;

  const { id } = await params;
  const existing = await prisma.sidebarLink.findFirst({
    where: { id, tenantId: check.tenantId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  await prisma.sidebarLink.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
