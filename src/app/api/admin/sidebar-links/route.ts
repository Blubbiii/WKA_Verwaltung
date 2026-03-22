import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";

const createSchema = z.object({
  label: z.string().min(1).max(100),
  url: z.string().url(),
  icon: z.string().default("Globe"),
  description: z.string().max(255).optional(),
  openInNewTab: z.boolean().default(true),
  minHierarchy: z.number().int().min(0).max(100).default(0),
  sortOrder: z.number().int().default(0),
});

export async function GET() {
  const check = await requireAdmin();
  if (!check.authorized) return check.error!;

  const links = await prisma.sidebarLink.findMany({
    where: { tenantId: check.tenantId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(links);
}

export async function POST(request: Request) {
  const check = await requireAdmin();
  if (!check.authorized) return check.error!;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const link = await prisma.sidebarLink.create({
    data: {
      ...parsed.data,
      tenantId: check.tenantId!,
    },
  });

  return NextResponse.json(link, { status: 201 });
}
