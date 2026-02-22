"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BatchAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "destructive";
  disabled?: boolean;
}

interface BatchActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  actions: BatchAction[];
}

/**
 * A sticky action bar that slides in from the bottom when table rows are selected.
 *
 * Shows the number of selected items, action buttons, and a clear-selection control.
 * Destructive actions are rendered with a red style.
 */
export function BatchActionBar({
  selectedCount,
  onClearSelection,
  actions,
}: BatchActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50",
        "border-t bg-background shadow-lg",
        "animate-in slide-in-from-bottom duration-200"
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
        {/* Left: selection count + clear */}
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-md bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary">
            {selectedCount} ausgewaehlt
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            className="text-muted-foreground"
          >
            <X className="mr-1 h-4 w-4" />
            Auswahl aufheben
          </Button>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-2">
          {actions.map((action) => (
            <Button
              key={action.label}
              variant={action.variant === "destructive" ? "destructive" : "outline"}
              size="sm"
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.icon}
              <span className="ml-1.5">{action.label}</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
