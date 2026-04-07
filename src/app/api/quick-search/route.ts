import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/withPermission";
import { prisma } from "@/lib/prisma";

// GET /api/quick-search?q=term&limit=10
// Fast multi-entity search for the Command Palette (Cmd+K)
// Searches Parks, Invoices, Contacts, Contracts, Funds via Prisma ILIKE

interface SearchResult {
  type: "park" | "invoice" | "contact" | "contract" | "fund";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export async function GET(request: NextRequest) {
  try {
    const check = await requirePermission("parks:read");
    if (!check.authorized) return check.error;
    const tenantId = check.tenantId!;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim();
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "10", 10) || 10, 1), 20);

    if (!q || q.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const [parks, invoices, contacts, contracts, funds] = await Promise.all([
      prisma.park.findMany({
        where: {
          tenantId,
          deletedAt: null,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { shortName: { contains: q, mode: "insensitive" } },
            { city: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, city: true, _count: { select: { turbines: true } } },
        take: limit,
      }),

      prisma.invoice.findMany({
        where: {
          tenantId,
          deletedAt: null,
          OR: [
            { invoiceNumber: { contains: q, mode: "insensitive" } },
            { recipientName: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, invoiceNumber: true, recipientName: true, invoiceType: true },
        take: limit,
      }),

      prisma.person.findMany({
        where: {
          tenantId,
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { companyName: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, firstName: true, lastName: true, companyName: true },
        take: limit,
      }),

      prisma.contract.findMany({
        where: {
          tenantId,
          deletedAt: null,
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { contractNumber: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, title: true, contractNumber: true, contractType: true },
        take: limit,
      }),

      prisma.fund.findMany({
        where: {
          tenantId,
          deletedAt: null,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { legalForm: { contains: q, mode: "insensitive" } },
          ],
        },
        select: { id: true, name: true, legalForm: true },
        take: limit,
      }),
    ]);

    const results: SearchResult[] = [
      ...parks.map((p: { id: string; name: string; city: string | null; _count: { turbines: number } }) => ({
        type: "park" as const,
        id: p.id,
        title: p.name,
        subtitle: [p.city, `${p._count.turbines} Anlagen`].filter(Boolean).join(" · "),
        href: `/parks/${p.id}`,
      })),
      ...invoices.map((i: { id: string; invoiceNumber: string | null; recipientName: string | null; invoiceType: string | null }) => ({
        type: "invoice" as const,
        id: i.id,
        title: i.invoiceNumber || "Ohne Nummer",
        subtitle: [i.recipientName, i.invoiceType].filter(Boolean).join(" · "),
        href: `/invoices/${i.id}`,
      })),
      ...contacts.map((c: { id: string; firstName: string | null; lastName: string | null; companyName: string | null }) => ({
        type: "contact" as const,
        id: c.id,
        title: [c.firstName, c.lastName].filter(Boolean).join(" "),
        subtitle: c.companyName || "",
        href: `/crm/contacts/${c.id}`,
      })),
      ...contracts.map((c: { id: string; title: string; contractNumber: string | null; contractType: string | null }) => ({
        type: "contract" as const,
        id: c.id,
        title: c.title,
        subtitle: [c.contractNumber, c.contractType].filter(Boolean).join(" · "),
        href: `/contracts/${c.id}`,
      })),
      ...funds.map((f: { id: string; name: string; legalForm: string | null }) => ({
        type: "fund" as const,
        id: f.id,
        title: f.name,
        subtitle: f.legalForm || "",
        href: `/funds/${f.id}`,
      })),
    ];

    return NextResponse.json({ results: results.slice(0, limit) });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
