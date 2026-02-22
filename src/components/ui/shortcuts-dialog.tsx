"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ShortcutDisplayItem {
  /** Pre-formatted key combination string, e.g. "Ctrl+K" or "G dann D" */
  keys: string;
  /** Human-readable description (German) */
  label: string;
}

export interface ShortcutGroup {
  /** Group name, e.g. "Navigation" */
  name: string;
  /** Shortcuts within this group */
  items: ShortcutDisplayItem[];
}

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: ShortcutGroup[];
}

// ---------------------------------------------------------------------------
// Kbd component (styled keyboard key)
// ---------------------------------------------------------------------------

function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs font-medium text-muted-foreground shadow-sm min-w-[1.5rem]",
        className
      )}
    >
      {children}
    </kbd>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ShortcutsDialog({
  open,
  onOpenChange,
  groups,
}: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tastenkombinationen</DialogTitle>
          <DialogDescription>
            Verwende Tastenkombinationen, um schneller durch die Anwendung zu
            navigieren.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {groups.map((group) => (
            <div key={group.name}>
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                {group.name}
              </h3>
              <div className="space-y-2">
                {group.items.map((item) => (
                  <div
                    key={item.keys + item.label}
                    className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50"
                  >
                    <span className="text-sm text-foreground">
                      {item.label}
                    </span>
                    <div className="flex items-center gap-1">
                      {renderKeys(item.keys)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t">
          <p className="text-xs text-muted-foreground text-center">
            Druecke <Kbd>?</Kbd> um dieses Fenster zu oeffnen oder zu
            schliessen.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Render a key-combination string into styled <Kbd> elements.
 * Handles formats like "Ctrl+K", "G dann D", single keys like "?".
 */
function renderKeys(keys: string): React.ReactNode[] {
  // Handle sequence shortcuts ("G dann D")
  if (keys.includes(" dann ")) {
    const [first, second] = keys.split(" dann ");
    return [
      <Kbd key="first">{first}</Kbd>,
      <span key="sep" className="mx-1 text-xs text-muted-foreground">
        dann
      </span>,
      <Kbd key="second">{second}</Kbd>,
    ];
  }

  // Handle modifier combinations ("Ctrl+K", "Cmd+K")
  if (keys.includes("+")) {
    const parts = keys.split("+");
    return parts.map((part, i) => (
      <span key={i} className="flex items-center">
        {i > 0 && (
          <span className="mx-0.5 text-xs text-muted-foreground">+</span>
        )}
        <Kbd>{part}</Kbd>
      </span>
    ));
  }

  // Single key
  return [<Kbd key="single">{keys}</Kbd>];
}
