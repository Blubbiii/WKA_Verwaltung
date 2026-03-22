import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/withPermission";

const createSchema = z.object({
  label: z.string().min(1).max(100),
  url: z.string().url({ message: "Bitte eine gültige URL eingeben (z.B. https://example.com)" }),
  icon: z.string().default("Globe"),
  description: z.string().max(255).optional(),
  openInNewTab: z.boolean().default(true),
  minHierarchy: z.number().int().min(0).max(100).default(0),
  sortOrder: z.number().int().default(0),
});

export async function GET() {
  const check = await requireAdmin();
  if (!check.authorized) return check.error!;

  try {
    const links = await prisma.sidebarLink.findMany({
      where: { tenantId: check.tenantId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(links);
  } catch {
    return NextResponse.json({ error: "Datenbankfehler beim Laden der Links" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const check = await requireAdmin();
  if (!check.authorized) return check.error!;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    // Return the first field error as a plain string so the client can display it
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const firstError =
      Object.values(fieldErrors).flat()[0] ??
      parsed.error.flatten().formErrors[0] ??
      "Ungültige Eingabe";
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  try {
    const link = await prisma.sidebarLink.create({
      data: {
        ...parsed.data,
        tenantId: check.tenantId!,
      },
    });
    return NextResponse.json(link, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Datenbankfehler beim Erstellen" }, { status: 500 });
  }
}
