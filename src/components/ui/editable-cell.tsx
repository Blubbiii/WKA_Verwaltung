"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

type CellValue = string | number | null | undefined;

interface EditableCellProps {
  value: CellValue;
  onSave: (newValue: string) => Promise<void>;
  type?: "text" | "number" | "select" | "date" | "textarea";
  options?: SelectOption[];
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  /** Format function for display (e.g. currency formatting) */
  formatDisplay?: (value: CellValue) => string;
  /**
   * If true (default), display value switches immediately after save() resolves
   * and rolls back on error. Set false to keep waiting on the Promise without
   * an optimistic flip.
   */
  optimistic?: boolean;
  /**
   * If provided, a "Saved" toast with an Undo button appears after a successful
   * save. Clicking Undo invokes this callback with the previous value.
   */
  onUndo?: (previousValue: CellValue) => Promise<void>;
  /**
   * If true, always show a short "Saved" toast after success (no Undo button
   * unless onUndo is also set). Default false to avoid spamming existing tables.
   */
  showSaveToast?: boolean;
  /** Tooltip shown when the cell is disabled — explains why it's not editable. */
  tooltipDisabled?: string;
  /**
   * If set, only one cell within the same scope can be in edit-mode at a time.
   * When this cell starts editing, any previously-active cell in the same scope
   * is cancelled first. Prevents race conditions where rapid clicks could cause
   * overlapping saves (e.g. CRM contacts table with multiple editable columns).
   */
  singleEditScope?: string;
}

// Module-level singleton: scope → cancel-fn of the currently-editing cell
const activeEditByScope = new Map<string, () => void>();

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
  optimistic = true,
  onUndo,
  showSaveToast = false,
  tooltipDisabled,
  singleEditScope,
}: EditableCellProps) {
  const t = useTranslations("common.editableCell");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  // Holds an optimistic value that overrides `value` until parent state catches up.
  // `hasOptimistic=false` means "no override".
  const [optimistic_, setOptimistic_] = useState<{ has: boolean; v: CellValue }>({
    has: false,
    v: null,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Stable ref to the latest cancel-fn so we can register it in the scope-singleton
  // and reliably compare identity at cleanup-time.
  const cancelFnRef = useRef<() => void>(() => {});

  // Reset the optimistic override once the incoming prop matches it (parent re-fetched).
  useEffect(() => {
    if (optimistic_.has && (value ?? "").toString() === (optimistic_.v ?? "").toString()) {
      setOptimistic_({ has: false, v: null });
    }
  }, [value, optimistic_]);

  // Normalize a value into the ISO date string (YYYY-MM-DD) for <input type="date">.
  const toDateString = useCallback((v: CellValue | Date): string => {
    if (v === null || v === undefined || v === "") return "";
    if (v instanceof Date) {
      return v.toISOString().slice(0, 10);
    }
    const s = v.toString();
    // Already a date-only ISO string?
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    // Try parsing more general strings (e.g. full ISO timestamp).
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return s;
  }, []);

  const effectiveValue: CellValue = optimistic_.has ? optimistic_.v : value;

  const displayValue = formatDisplay
    ? formatDisplay(effectiveValue)
    : type === "date"
      ? toDateString(effectiveValue)
      : (effectiveValue ?? "").toString();

  const cancel = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  // Keep ref in sync so the scope-singleton always holds the latest cancel-fn.
  useEffect(() => {
    cancelFnRef.current = cancel;
  }, [cancel]);

  const startEditing = useCallback(() => {
    if (disabled || saving) return;
    // Scope-lock: cancel any other cell currently editing in the same scope.
    if (singleEditScope) {
      const prevCancel = activeEditByScope.get(singleEditScope);
      if (prevCancel && prevCancel !== cancelFnRef.current) {
        prevCancel();
      }
      activeEditByScope.set(singleEditScope, cancelFnRef.current);
    }
    const initial =
      type === "date"
        ? toDateString(effectiveValue)
        : (effectiveValue ?? "").toString();
    setDraft(initial);
    setError(null);
    setEditing(true);
    // Focus input/textarea after render
    setTimeout(() => {
      if (type === "textarea") textareaRef.current?.focus();
      else inputRef.current?.focus();
    }, 0);
  }, [disabled, saving, effectiveValue, type, toDateString, singleEditScope]);

  // Release the scope-lock when this cell unmounts or leaves edit-mode,
  // but only if WE still own it (another cell may have taken over).
  useEffect(() => {
    if (!singleEditScope) return;
    if (!editing) {
      if (activeEditByScope.get(singleEditScope) === cancelFnRef.current) {
        activeEditByScope.delete(singleEditScope);
      }
    }
    return () => {
      if (singleEditScope && activeEditByScope.get(singleEditScope) === cancelFnRef.current) {
        activeEditByScope.delete(singleEditScope);
      }
    };
  }, [editing, singleEditScope]);

  const runSave = useCallback(
    async (rawValue: string) => {
      // Skip save if value unchanged compared to the currently-effective value.
      const baselineString =
        type === "date"
          ? toDateString(effectiveValue)
          : (effectiveValue ?? "").toString();
      const next = type === "textarea" ? rawValue : rawValue.trim();
      if (next === baselineString) {
        setEditing(false);
        return;
      }

      const previousValue = value; // capture original prop value for undo / rollback
      setSaving(true);
      setError(null);

      if (optimistic) {
        // Flip display immediately, then close editor.
        setOptimistic_({ has: true, v: next });
        setEditing(false);
      }

      try {
        await onSave(next);
        if (!optimistic) {
          setEditing(false);
        }

        if (onUndo) {
          toast.success(t("savedWithUndo"), {
            duration: 5000,
            action: {
              label: t("undo"),
              onClick: () => {
                void (async () => {
                  try {
                    // Optimistically revert display while the undo runs.
                    if (optimistic) setOptimistic_({ has: true, v: previousValue });
                    await onUndo(previousValue);
                  } catch (undoErr) {
                    if (optimistic) setOptimistic_({ has: true, v: next }); // restore failed-undo state
                    toast.error(
                      undoErr instanceof Error ? undoErr.message : t("undoFailed"),
                    );
                  }
                })();
              },
            },
          });
        } else if (showSaveToast) {
          toast.success(t("savedWithUndo"), { duration: 2500 });
        }
      } catch (err) {
        // Rollback optimistic flip
        if (optimistic) setOptimistic_({ has: false, v: null });
        const msg = err instanceof Error ? err.message : t("saveFailed");
        setError(msg);
        if (optimistic) {
          // Editor was already closed — surface failure via toast since inline error UI is gone.
          toast.error(msg);
        }
      } finally {
        setSaving(false);
      }
    },
    [effectiveValue, value, type, optimistic, onSave, onUndo, showSaveToast, t, toDateString],
  );

  const save = useCallback(() => runSave(draft), [runSave, draft]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        save();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    },
    [save, cancel],
  );

  const handleTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        save();
      } else if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
      // Plain Enter → newline (default behavior, not prevented)
    },
    [save, cancel],
  );

  // Select type
  if (editing && type === "select" && options) {
    return (
      <div className={cn("relative min-w-[120px]", className)}>
        <Select
          value={draft}
          onValueChange={(val) => {
            setDraft(val);
            void runSave(val);
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
        {saving && (
          <Loader2 className="absolute right-8 top-2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
    );
  }

  // Textarea type
  if (editing && type === "textarea") {
    return (
      <div className={cn("relative min-w-[200px]", className)}>
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleTextareaKeyDown}
          onBlur={save}
          disabled={saving}
          className={cn(
            "min-h-[60px] text-sm",
            error && "border-destructive focus-visible:ring-destructive",
          )}
        />
        {saving && (
          <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {error && (
          <p className="absolute -bottom-5 left-0 text-[11px] text-destructive whitespace-nowrap">
            {error}
          </p>
        )}
      </div>
    );
  }

  // Text / Number / Date input
  if (editing) {
    const htmlType =
      type === "number" ? "number" : type === "date" ? "date" : "text";
    return (
      <div className={cn("relative min-w-[100px]", className)}>
        <Input
          ref={inputRef}
          type={htmlType}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleInputKeyDown}
          onBlur={save}
          disabled={saving}
          className={cn(
            "h-8 text-sm",
            error && "border-destructive focus-visible:ring-destructive",
          )}
        />
        {saving && (
          <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {error && (
          <p className="absolute -bottom-5 left-0 text-[11px] text-destructive whitespace-nowrap">
            {error}
          </p>
        )}
      </div>
    );
  }

  // Display mode
  const tooltip = disabled && tooltipDisabled ? tooltipDisabled : undefined;
  return (
    <div
      className={cn(
        "group/cell inline-flex items-center gap-1 min-h-[32px] px-1 -mx-1 rounded",
        !disabled && "cursor-pointer hover:bg-muted/60 transition-colors",
        className,
      )}
      onClick={startEditing}
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? undefined : 0}
      title={tooltip}
      onKeyDown={
        disabled
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                startEditing();
              }
            }
      }
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
