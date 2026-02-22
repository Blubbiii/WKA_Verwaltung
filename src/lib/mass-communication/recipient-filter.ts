// Shared recipient filtering logic for mass communication
// Used by both the preview and send endpoints

import { prisma } from "@/lib/prisma";

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
  // Base where clause: shareholders in the tenant with a person that has an email
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseWhere: any = {
    fund: {
      tenantId,
    },
    person: {
      email: {
        not: null,
      },
    },
  };

  switch (recipientFilter) {
    case "ALL":
      break;

    case "BY_FUND":
      if (fundIds && fundIds.length > 0) {
        baseWhere.fundId = { in: fundIds };
      }
      break;

    case "BY_PARK":
      if (parkIds && parkIds.length > 0) {
        baseWhere.fund = {
          ...baseWhere.fund,
          fundParks: {
            some: {
              parkId: { in: parkIds },
            },
          },
        };
      }
      break;

    case "BY_ROLE":
      baseWhere.status = "ACTIVE";
      break;

    case "ACTIVE_ONLY":
      baseWhere.status = "ACTIVE";
      baseWhere.exitDate = null;
      break;
  }

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
