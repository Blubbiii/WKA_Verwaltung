"use client";

import { useEffect, useRef, useCallback } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Shortcut {
  /** The key to listen for (lowercase), e.g. "k", "/", "?" */
  key: string;
  /** Require Ctrl (Windows/Linux) or Cmd (Mac) */
  ctrl?: boolean;
  /** Require Shift modifier */
  shift?: boolean;
  /** Require Alt/Option modifier */
  alt?: boolean;
  /** Human-readable description (German) */
  label: string;
  /** Callback to execute */
  action: () => void;
  /** Group name for the help dialog */
  group: string;
}

export interface SequenceShortcut {
  /** First key in the sequence, e.g. "g" */
  prefix: string;
  /** Second key in the sequence, e.g. "d" */
  key: string;
  /** Human-readable description (German) */
  label: string;
  /** Callback to execute */
  action: () => void;
  /** Group name for the help dialog */
  group: string;
  /** Time window in ms for the second key (default: 1000) */
  timeout?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const IGNORED_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** Returns true if the event originates from an editable element */
function isEditableTarget(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  if (IGNORED_TAGS.has(target.tagName)) return true;
  if (target.isContentEditable) return true;
  // Also ignore when inside a dialog/modal with role="dialog"
  if (target.closest("[role='dialog']")) return true;
  return false;
}

/** Detect macOS / iOS for showing Cmd vs Ctrl */
export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  // navigator.platform is deprecated but still widely supported
  // Fall back to userAgent if platform is unavailable
  const platform = navigator.platform?.toLowerCase() ?? "";
  if (platform.includes("mac")) return true;
  const ua = navigator.userAgent?.toLowerCase() ?? "";
  return ua.includes("macintosh") || ua.includes("mac os");
}

/** Format a shortcut for display, e.g. "Ctrl+K" or "Cmd+K" */
export function formatShortcutKeys(shortcut: {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}): string {
  const parts: string[] = [];
  const mac = isMac();

  if (shortcut.ctrl) parts.push(mac ? "\u2318" : "Ctrl");
  if (shortcut.alt) parts.push(mac ? "\u2325" : "Alt");
  if (shortcut.shift) parts.push(mac ? "\u21E7" : "Shift");

  // Prettify certain keys
  const keyMap: Record<string, string> = {
    "?": "?",
    "/": "/",
    enter: "\u21B5",
    escape: "Esc",
    arrowup: "\u2191",
    arrowdown: "\u2193",
  };

  const displayKey = keyMap[shortcut.key.toLowerCase()] ?? shortcut.key.toUpperCase();
  parts.push(displayKey);

  return parts.join(mac ? "" : "+");
}

/** Format a sequence shortcut for display, e.g. "g then d" */
export function formatSequenceKeys(shortcut: {
  prefix: string;
  key: string;
}): string {
  return `${shortcut.prefix.toUpperCase()} dann ${shortcut.key.toUpperCase()}`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseKeyboardShortcutsOptions {
  /** Simple key shortcuts */
  shortcuts?: Shortcut[];
  /** Two-key sequence shortcuts (e.g. g then d) */
  sequences?: SequenceShortcut[];
  /** Whether shortcuts are enabled (default: true) */
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  shortcuts = [],
  sequences = [],
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  // Track the pending prefix key and its timestamp for sequence shortcuts
  const pendingPrefix = useRef<{ key: string; timestamp: number } | null>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;
      if (!event.key) return;

      const key = event.key.toLowerCase();
      const hasCtrl = event.ctrlKey || event.metaKey;
      const hasShift = event.shiftKey;
      const hasAlt = event.altKey;

      // ---- Shortcuts that require modifiers work even in inputs ----
      for (const shortcut of shortcuts) {
        if (shortcut.ctrl && !hasCtrl) continue;
        if (!shortcut.ctrl && hasCtrl) continue;
        if (shortcut.shift && !hasShift) continue;
        if (shortcut.alt && !hasAlt) continue;

        // Match key - for "?" we also check the raw key
        const matchKey = shortcut.key.toLowerCase();
        if (key === matchKey || event.key === shortcut.key) {
          // For non-modifier shortcuts, skip editable targets
          if (!shortcut.ctrl && !shortcut.alt && isEditableTarget(event)) continue;

          event.preventDefault();
          event.stopPropagation();
          shortcut.action();
          pendingPrefix.current = null;
          return;
        }
      }

      // ---- Non-modifier shortcuts should not fire in editable targets ----
      if (isEditableTarget(event)) return;
      if (hasCtrl || hasAlt) return; // Don't interfere with browser shortcuts

      // ---- Check for sequence completions ----
      if (pendingPrefix.current) {
        const { key: prefixKey, timestamp } = pendingPrefix.current;
        pendingPrefix.current = null; // Always clear after checking

        for (const seq of sequences) {
          const timeout = seq.timeout ?? 1000;
          if (
            seq.prefix.toLowerCase() === prefixKey &&
            seq.key.toLowerCase() === key &&
            Date.now() - timestamp < timeout
          ) {
            event.preventDefault();
            event.stopPropagation();
            seq.action();
            return;
          }
        }
      }

      // ---- Check if key is a sequence prefix ----
      const isPrefix = sequences.some(
        (seq) => seq.prefix.toLowerCase() === key
      );
      if (isPrefix) {
        pendingPrefix.current = { key, timestamp: Date.now() };
        return;
      }
    },
    [shortcuts, sequences, enabled]
  );

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [handleKeyDown, enabled]);
}
