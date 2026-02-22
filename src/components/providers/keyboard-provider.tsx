"use client";

import { createContext, useContext, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  useKeyboardShortcuts,
  formatShortcutKeys,
  formatSequenceKeys,
  type Shortcut,
  type SequenceShortcut,
} from "@/hooks/useKeyboardShortcuts";
import {
  ShortcutsDialog,
  type ShortcutGroup,
} from "@/components/ui/shortcuts-dialog";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface KeyboardContextValue {
  /** Open the shortcuts help dialog */
  openShortcutsDialog: () => void;
  /** Close the shortcuts help dialog */
  closeShortcutsDialog: () => void;
  /** Whether the shortcuts dialog is open */
  isDialogOpen: boolean;
  /** All shortcut groups for external consumption */
  shortcutGroups: ShortcutGroup[];
}

const KeyboardContext = createContext<KeyboardContextValue | null>(null);

export function useKeyboardContext() {
  const ctx = useContext(KeyboardContext);
  if (!ctx) {
    throw new Error(
      "useKeyboardContext must be used within a KeyboardProvider"
    );
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface KeyboardProviderProps {
  children: React.ReactNode;
}

export function KeyboardProvider({ children }: KeyboardProviderProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);

  const openShortcutsDialog = useCallback(() => setDialogOpen(true), []);
  const closeShortcutsDialog = useCallback(() => setDialogOpen(false), []);

  // -------------------------------------------------------------------
  // Define shortcuts
  // -------------------------------------------------------------------

  const shortcuts: Shortcut[] = useMemo(
    () => [
      // ---- Help ----
      {
        key: "?",
        label: "Tastenkombinationen anzeigen",
        group: "Allgemein",
        action: () => setDialogOpen((prev) => !prev),
      },

      // ---- Global search (Ctrl/Cmd+K) ----
      // NOTE: The documents page has its own Ctrl+K handler.
      // This global one focuses the header search input when
      // not on the documents page. The documents page handler
      // will take priority because it uses its own useEffect.
      {
        key: "k",
        ctrl: true,
        label: "Suche oeffnen",
        group: "Aktionen",
        action: () => {
          // Focus the search input in the header
          const searchInput = document.querySelector(
            'header input[type="search"]'
          ) as HTMLInputElement | null;
          if (searchInput) {
            searchInput.focus();
            searchInput.select();
          }
        },
      },
    ],
    []
  );

  const sequences: SequenceShortcut[] = useMemo(
    () => [
      // ---- Navigation (g then ...) ----
      {
        prefix: "g",
        key: "d",
        label: "Zum Dashboard",
        group: "Navigation",
        action: () => router.push("/dashboard"),
      },
      {
        prefix: "g",
        key: "p",
        label: "Zu Windparks",
        group: "Navigation",
        action: () => router.push("/parks"),
      },
      {
        prefix: "g",
        key: "f",
        label: "Zu Beteiligungen",
        group: "Navigation",
        action: () => router.push("/funds"),
      },
      {
        prefix: "g",
        key: "i",
        label: "Zu Rechnungen",
        group: "Navigation",
        action: () => router.push("/invoices"),
      },
      {
        prefix: "g",
        key: "e",
        label: "Zu Energiedaten",
        group: "Navigation",
        action: () => router.push("/energy"),
      },
      {
        prefix: "g",
        key: "s",
        label: "Zu Einstellungen",
        group: "Navigation",
        action: () => router.push("/settings"),
      },
      {
        prefix: "g",
        key: "c",
        label: "Zu Vertraegen",
        group: "Navigation",
        action: () => router.push("/contracts"),
      },
      {
        prefix: "g",
        key: "l",
        label: "Zu Pachtvertraegen",
        group: "Navigation",
        action: () => router.push("/leases"),
      },
      {
        prefix: "g",
        key: "o",
        label: "Zu Dokumenten",
        group: "Navigation",
        action: () => router.push("/documents"),
      },
    ],
    [router]
  );

  // Register all shortcuts
  useKeyboardShortcuts({
    shortcuts,
    sequences,
    enabled: true,
  });

  // -------------------------------------------------------------------
  // Build display groups for the dialog
  // -------------------------------------------------------------------

  const shortcutGroups: ShortcutGroup[] = useMemo(() => {
    // Group all shortcuts + sequences by their group label
    const groupMap = new Map<
      string,
      { keys: string; label: string }[]
    >();

    for (const s of shortcuts) {
      const items = groupMap.get(s.group) ?? [];
      items.push({ keys: formatShortcutKeys(s), label: s.label });
      groupMap.set(s.group, items);
    }

    for (const s of sequences) {
      const items = groupMap.get(s.group) ?? [];
      items.push({ keys: formatSequenceKeys(s), label: s.label });
      groupMap.set(s.group, items);
    }

    // Define preferred ordering
    const order = ["Allgemein", "Aktionen", "Navigation", "Tabelle"];
    const result: ShortcutGroup[] = [];

    for (const name of order) {
      const items = groupMap.get(name);
      if (items && items.length > 0) {
        result.push({ name, items });
        groupMap.delete(name);
      }
    }

    // Append any remaining groups
    for (const [name, items] of groupMap) {
      if (items.length > 0) {
        result.push({ name, items });
      }
    }

    return result;
  }, [shortcuts, sequences]);

  // -------------------------------------------------------------------
  // Context value
  // -------------------------------------------------------------------

  const contextValue: KeyboardContextValue = useMemo(
    () => ({
      openShortcutsDialog,
      closeShortcutsDialog,
      isDialogOpen: dialogOpen,
      shortcutGroups,
    }),
    [openShortcutsDialog, closeShortcutsDialog, dialogOpen, shortcutGroups]
  );

  return (
    <KeyboardContext.Provider value={contextValue}>
      {children}
      <ShortcutsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        groups={shortcutGroups}
      />
    </KeyboardContext.Provider>
  );
}
