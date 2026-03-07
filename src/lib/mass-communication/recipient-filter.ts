// Shared recipient filtering logic for mass communication
// Used by both the preview and send endpoints

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export interface RecipientInfo {
  id: string;
  name: string;
  email: string;
  fund: string;
}

export async function getFilteredRecipients(
  tenantId: string,
  recipientFilter: string,
  fundIds?: string[],
  parkIds?: string[]
): Promise<RecipientInfo[]> {
  // Build fund filter
  let fundFilter: Prisma.FundWhereInput = { tenantId };
  let fundIdFilter: Prisma.ShareholderWhereInput["fundId"] = undefined;
  let statusFilter: Prisma.ShareholderWhereInput["status"] = undefined;
  let exitDateFilter: Prisma.ShareholderWhereInput["exitDate"] = undefined;

  switch (recipientFilter) {
    case "ALL":
      break;

    case "BY_FUND":
      if (fundIds && fundIds.length > 0) {
        fundIdFilter = { in: fundIds };
      }
      break;

    case "BY_PARK":
      if (parkIds && parkIds.length > 0) {
        fundFilter = {
          ...fundFilter,
          fundParks: {
            some: {
              parkId: { in: parkIds },
            },
          },
        };
      }
      break;

    case "BY_ROLE":
      statusFilter = "ACTIVE";
      break;

    case "ACTIVE_ONLY":
      statusFilter = "ACTIVE";
      exitDateFilter = null;
      break;
  }

  // Base where clause: shareholders in the tenant with a person that has an email
  const baseWhere: Prisma.ShareholderWhereInput = {
    fund: fundFilter,
    person: {
      email: {
        not: null,
      },
    },
    ...(fundIdFilter !== undefined && { fundId: fundIdFilter }),
    ...(statusFilter !== undefined && { status: statusFilter }),
    ...(exitDateFilter !== undefined && { exitDate: exitDateFilter }),
  };

  const shareholders = await prisma.shareholder.findMany({
    where: baseWhere,
    include: {
      person: {
        select: {
          firstName: true,
          lastName: true,
          companyName: true,
          email: true,
        },
      },
      fund: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [
      { fund: { name: "asc" } },
      { person: { lastName: "asc" } },
    ],
  });

  // Deduplicate by email (a person can be shareholder in multiple funds)
  const emailMap = new Map<string, RecipientInfo>();

  for (const sh of shareholders) {
    const email = sh.person.email;
    if (!email) continue;

    const name =
      sh.person.companyName ||
      [sh.person.firstName, sh.person.lastName].filter(Boolean).join(" ") ||
      email;

    if (emailMap.has(email)) {
      const existing = emailMap.get(email)!;
      if (!existing.fund.includes(sh.fund.name)) {
        existing.fund += `, ${sh.fund.name}`;
      }
    } else {
      emailMap.set(email, {
        id: sh.id,
        name,
        email,
        fund: sh.fund.name,
      });
    }
  }

  return Array.from(emailMap.values());
}
