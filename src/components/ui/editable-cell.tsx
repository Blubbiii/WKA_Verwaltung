"use client";

import { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectOption {
  value: string;
  label: string;
}

interface EditableCellProps {
  value: string | number | null | undefined;
  onSave: (newValue: string) => Promise<void>;
  type?: "text" | "number" | "select";
  options?: SelectOption[];
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  /** Format function for display (e.g. currency formatting) */
  formatDisplay?: (value: string | number | null | undefined) => string;
}

/**
 * Inline-editable table cell. Click to edit, Enter to save, Escape to cancel.
 * Shows a subtle pencil icon on hover when editable.
 */
export function EditableCell({
  value,
  onSave,
  type = "text",
  options,
  disabled = false,
  className,
  placeholder = "—",
  formatDisplay,
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const displayValue = formatDisplay
    ? formatDisplay(value)
    : (value ?? "").toString();

  const startEditing = useCallback(() => {
    if (disabled || saving) return;
    setDraft((value ?? "").toString());
    setError(null);
    setEditing(true);
    // Focus input after render
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [disabled, saving, value]);

  const cancel = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  const save = useCallback(async () => {
    const trimmed = draft.trim();
    // Skip save if value unchanged
    if (trimmed === (value ?? "").toString()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  }, [draft, value, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        save();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    },
    [save, cancel]
  );

  // Select type
  if (editing && type === "select" && options) {
    return (
      <div className={cn("relative min-w-[120px]", className)}>
        <Select
          value={draft}
          onValueChange={async (val) => {
            setDraft(val);
            setSaving(true);
            setError(null);
            try {
              await onSave(val);
              setEditing(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
            } finally {
              setSaving(false);
            }
          }}
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {saving && <Loader2 className="absolute right-8 top-2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
    );
  }

  // Text/Number input
  if (editing) {
    return (
      <div className={cn("relative min-w-[100px]", className)}>
        <Input
          ref={inputRef}
          type={type === "number" ? "number" : "text"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={save}
          disabled={saving}
          className={cn(
            "h-8 text-sm",
            error && "border-destructive focus-visible:ring-destructive"
          )}
        />
        {saving && <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin text-muted-foreground" />}
        {error && (
          <p className="absolute -bottom-5 left-0 text-[11px] text-destructive whitespace-nowrap">
            {error}
          </p>
        )}
      </div>
    );
  }

  // Display mode
  return (
    <div
      className={cn(
        "group/cell inline-flex items-center gap-1 min-h-[32px] px-1 -mx-1 rounded",
        !disabled && "cursor-pointer hover:bg-muted/60 transition-colors",
        className
      )}
      onClick={startEditing}
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? undefined : 0}
      onKeyDown={disabled ? undefined : (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          startEditing();
        }
      }}
    >
      <span className={cn(!displayValue && "text-muted-foreground")}>
        {displayValue || placeholder}
      </span>
      {!disabled && (
        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover/cell:opacity-100 transition-opacity shrink-0" />
      )}
    </div>
  );
}
