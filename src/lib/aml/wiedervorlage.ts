/**
 * Checks are never overwritten (each is its own proof, § 8 Abs. 4 GwG), so a
 * person collects several. What is due is decided by the newest one only —
 * otherwise an expired check from 2020 stays "due" after the 2026 renewal.
 */
export function neuesteJePerson<T extends { personId: string; createdAt: Date | string }>(
  pruefungen: T[],
): T[] {
  const zeit = (p: T) => new Date(p.createdAt).getTime();
  const neueste = new Map<string, T>();
  for (const p of pruefungen) {
    const bisher = neueste.get(p.personId);
    if (!bisher || zeit(p) > zeit(bisher)) neueste.set(p.personId, p);
  }
  return [...neueste.values()];
}
