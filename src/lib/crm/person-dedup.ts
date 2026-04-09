/**
 * Person deduplication helper.
 *
 * Key: firstName + lastName + street + houseNumber + postalCode
 *      (or: companyName + street + houseNumber + postalCode for legal persons)
 *
 * Comparison is case-insensitive and trims whitespace.
 */

import { prisma } from "@/lib/prisma";

export interface PersonDedupInput {
  personType?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
  street?: string | null;
  houseNumber?: string | null;
  postalCode?: string | null;
}

export interface PersonDedupMatch {
  id: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  email: string | null;
}

function norm(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

/**
 * Returns true if the input has enough identity fields to run a dedup check.
 * An empty address or empty name cannot produce a meaningful collision.
 */
export function hasDedupKey(input: PersonDedupInput): boolean {
  const hasName =
    !!norm(input.companyName) ||
    (!!norm(input.firstName) && !!norm(input.lastName));
  const hasAddress =
    !!norm(input.street) &&
    !!norm(input.houseNumber) &&
    !!norm(input.postalCode);
  return hasName && hasAddress;
}

/**
 * Look up an existing Person in the given tenant that matches the input on
 * name + street + houseNumber + postalCode (case-insensitive). Returns null
 * if the dedup key is incomplete or no match is found.
 */
export async function findMatchingPerson(
  tenantId: string,
  input: PersonDedupInput,
): Promise<PersonDedupMatch | null> {
  if (!hasDedupKey(input)) return null;

  // Use Prisma's case-insensitive match; include both natural and legal cases.
  // We intentionally fetch all candidate rows by address and compare names in
  // JS to keep the query indexable.
  const candidates = await prisma.person.findMany({
    where: {
      tenantId,
      street: { equals: input.street!, mode: "insensitive" },
      houseNumber: { equals: input.houseNumber!, mode: "insensitive" },
      postalCode: { equals: input.postalCode!, mode: "insensitive" },
    },
    select: {
      id: true,
      personType: true,
      firstName: true,
      lastName: true,
      companyName: true,
      street: true,
      houseNumber: true,
      postalCode: true,
      city: true,
      email: true,
    },
    take: 20,
  });

  const wantedCompany = norm(input.companyName);
  const wantedFirst = norm(input.firstName);
  const wantedLast = norm(input.lastName);

  for (const c of candidates) {
    // Legal: match by companyName
    if (wantedCompany && norm(c.companyName) === wantedCompany) {
      return {
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        companyName: c.companyName,
        street: c.street,
        houseNumber: c.houseNumber,
        postalCode: c.postalCode,
        city: c.city,
        email: c.email,
      };
    }
    // Natural: match by firstName + lastName
    if (
      wantedFirst &&
      wantedLast &&
      norm(c.firstName) === wantedFirst &&
      norm(c.lastName) === wantedLast
    ) {
      return {
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        companyName: c.companyName,
        street: c.street,
        houseNumber: c.houseNumber,
        postalCode: c.postalCode,
        city: c.city,
        email: c.email,
      };
    }
  }
  return null;
}
