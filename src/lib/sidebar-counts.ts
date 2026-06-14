/**
 * Sidebar-Counts: shared types & constants.
 *
 * Diese Datei definiert welche Sidebar-Items eine dynamische Badge-Zahl
 * tragen können. Die Liste ist deklarativ — neue Counts werden hier
 * registriert, dann
 *   1. /api/sidebar/counts liefert den Wert,
 *   2. nav-config.ts referenziert den Key via `badgeKey: "..."`,
 *   3. Sidebar rendert die Badge automatisch.
 *
 * Wir nutzen ein konstantes Tuple statt eines Records, damit Tippfehler
 * an der Aufrufstelle TypeScript-Fehler werden.
 */

export const SIDEBAR_COUNT_KEYS = [
  /** Pending Approval-Requests die der User entscheiden darf */
  "approvals",
  /** Neue E-Mail-Belege im Inbox die noch nicht verarbeitet sind */
  "inbox",
  /** Überfällige Rechnungen (SENT/PARTIALLY_PAID + dueDate < today) */
  "mahnwesen",
  /** Unzugeordnete Bank-Transaktionen */
  "bankUnmatched",
  /** Verträge mit Frist in den nächsten 30 Tagen */
  "expiringContracts",
] as const;

export type SidebarCountKey = (typeof SIDEBAR_COUNT_KEYS)[number];

/**
 * Antwort-Shape von /api/sidebar/counts.
 * Alle Keys aus SIDEBAR_COUNT_KEYS sind required — der Server liefert 0
 * statt undefined, damit der Client nicht prüfen muss.
 *
 * Für Counts die der User nicht sehen darf (fehlende Permission) liefert
 * der Server bewusst 0, statt 403/404 — sonst leakt die Badge Counts von
 * Daten zu denen er keinen Zugriff hat.
 */
export type SidebarCounts = Record<SidebarCountKey, number>;

/** Default-Wert für initial-State im Hook. */
export const EMPTY_SIDEBAR_COUNTS: SidebarCounts = {
  approvals: 0,
  inbox: 0,
  mahnwesen: 0,
  bankUnmatched: 0,
  expiringContracts: 0,
};

/**
 * Visueller Hint für Badge-Farbe.
 * - `default`: Standard (Brand-Tint) — Information, keine Eile
 * - `warning`: Zeitkritisch (z.B. Fristen, überfällige Mahnungen)
 * - `destructive`: Sehr kritisch (z.B. überfällige 4-Augen-Approvals)
 */
export type SidebarBadgeTone = "default" | "warning" | "destructive";

export const BADGE_TONE_BY_KEY: Record<SidebarCountKey, SidebarBadgeTone> = {
  approvals: "warning",        // Approvals warten auf User-Action
  inbox: "default",            // Neue Belege, kein Druck
  mahnwesen: "destructive",    // Überfällig = ernst
  bankUnmatched: "default",    // Aufräum-Arbeit
  expiringContracts: "warning",// Fristen
};
