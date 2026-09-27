/**
 * Whether an e-mail address already belongs to a user account.
 *
 * Deliberately across all tenants: the login looks users up by e-mail
 * alone, so an address can exist only once in the whole installation.
 * Routes otherwise scoped with mandantDb call this instead of reaching for
 * the shared prisma client themselves.
 */

import { prisma } from "@/lib/prisma";

export async function emailVergeben(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return user !== null;
}
