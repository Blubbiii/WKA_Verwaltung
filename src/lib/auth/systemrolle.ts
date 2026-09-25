/** Role chosen in the tenant wizard -> id of the matching system role (by level). */
const STUFE = { ADMIN: 80, MANAGER: 60, VIEWER: 40 } as const;

export function systemrolleFuer(
  rollen: Array<{ id: string; isSystem: boolean; hierarchy: number }>,
  wahl: keyof typeof STUFE,
): string | null {
  return rollen.find((r) => r.isSystem && r.hierarchy === STUFE[wahl])?.id ?? null;
}
