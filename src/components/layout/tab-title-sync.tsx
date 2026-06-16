"use client";

/**
 * TabTitleSync — unsichtbarer Mount-Punkt für das Browser-Tab-Title-Prefix.
 *
 * Zieht die Sidebar-Counts (gleiche Quelle wie die Sidebar-Badges) und
 * prefixt document.title mit "(N) " wenn N > 0. So sieht der User auch in
 * einem anderen Tab, dass etwas zu tun ist.
 *
 * Wird im Dashboard-Layout gemountet — nur dort wo ein eingeloggter User
 * tatsächlich Action-Items haben kann. Im Marketing-/Portal-Layout
 * absichtlich nicht aktiv.
 */

import { useSidebarCounts } from "@/hooks/useSidebarCounts";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export function TabTitleSync(): null {
  const counts = useSidebarCounts();
  // Action-Items, die Aufmerksamkeit verdienen. bewusst dieselbe Auswahl
  // wie die Sidebar — wenn dort eine Badge zu sehen wäre, soll auch der
  // Tab-Title sie tragen.
  const total =
    counts.approvals +
    counts.inbox +
    counts.mahnwesen +
    counts.bankUnmatched +
    counts.expiringContracts;
  useDocumentTitle(total);
  return null;
}
