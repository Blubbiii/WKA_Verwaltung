/**
 * Breadcrumb prefixes that have no page of their own.
 *
 * The breadcrumb turns every path prefix into a link. For these prefixes
 * that link ends in a 404 (or, for `/leases/usage-fees/setup`, in the
 * `[id]` detail page with id "setup"), so they are shown as plain text.
 *
 * `*` stands for one dynamic segment. brotkrumen-ziele.test.ts derives this
 * list from src/app and fails when a page is added or removed.
 */
export const PFADE_OHNE_SEITE: readonly string[] = [
  "/energy/productions/*",
  "/leases/usage-fees/setup",
  "/reports",
  "/verwaltung",
];

const MUSTER = PFADE_OHNE_SEITE.map((p) => p.split("/").filter(Boolean));

export function hatEigeneSeite(pfad: string): boolean {
  const teile = pfad.split("/").filter(Boolean);
  return !MUSTER.some(
    (muster) =>
      muster.length === teile.length &&
      muster.every((t, i) => t === "*" || t === teile[i])
  );
}
