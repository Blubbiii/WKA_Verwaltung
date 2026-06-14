"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Redesign 2026-06 — Phase 2: AmountInput
 *
 * Spezial-Input für Geld-Beträge mit deutschen Buchhaltungs-Konventionen.
 *
 * Eingaben werden tolerant akzeptiert:
 *  - "1234,56" oder "1.234,56" oder "1234.56" → alle gleich gut
 *  - Tausender-Punkte/Spaces werden beim Blur normalisiert
 *  - "-12,5" und "(12,5)" beide als negativ erkannt
 *  - "12,5%" wird beim Blur als reine Zahl gespeichert (Prozent-Suffix stripped)
 *
 * Display beim Blur:
 *  - Tabular-Numerals via .tabular-currency
 *  - Right-aligned
 *  - Currency-Suffix ("€" / Custom) als Adornment
 *  - Negative in Klammern als Option (Buchhaltungs-Standard)
 *
 * Tastatur:
 *  - Esc setzt auf letzten committed Wert zurück
 *  - Tab springt zum nächsten Feld (Browser-Default — wir interferieren nicht)
 */

export interface AmountInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: number | null | "";
  onChange: (value: number | null) => void;
  /** Currency-Suffix, default "€" */
  currency?: string;
  /** Anzahl Nachkommastellen, default 2 */
  decimals?: number;
  /** Negative in Klammern darstellen (statt mit Minus), default true für Buchhaltung */
  negativeInParens?: boolean;
  /** Auch null erlaubt (leeres Feld → null), default true */
  allowNull?: boolean;
  /** Minimum, optional */
  min?: number;
  /** Maximum, optional */
  max?: number;
}

function parseGermanAmount(input: string): number | null {
  if (!input) return null;
  let s = input.trim();
  if (!s) return null;

  // Klammern → negativ
  let isNegative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    isNegative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith("-")) {
    isNegative = !isNegative;
    s = s.slice(1).trim();
  }
  if (s.startsWith("+")) {
    s = s.slice(1).trim();
  }

  // Prozent-/€-/$-Suffix stripped
  s = s.replace(/[€$£%]/g, "").trim();
  // Whitespaces komplett raus
  s = s.replace(/\s/g, "");

  if (!s) return null;

  // Falls Komma UND Punkt vorhanden: deutsche Notation, Punkt = Tausender
  if (s.includes(",") && s.includes(".")) {
    // Annahme: deutsche Notation (12.345,67) wenn Komma als letztes
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // englische Notation (12,345.67)
      s = s.replace(/,/g, "");
    }
  } else if (s.includes(",")) {
    // Nur Komma vorhanden — deutsche Dezimaltrennung
    s = s.replace(",", ".");
  }
  // Sonst nur Punkt: bleibt als Dezimaltrennung

  const num = parseFloat(s);
  if (Number.isNaN(num)) return null;
  return isNegative ? -num : num;
}

function formatGermanAmount(
  value: number,
  decimals: number,
  negativeInParens: boolean,
): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("de-DE", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (value < 0) {
    return negativeInParens ? `(${formatted})` : `-${formatted}`;
  }
  return formatted;
}

export const AmountInput = React.forwardRef<HTMLInputElement, AmountInputProps>(
  function AmountInput(
    {
      value,
      onChange,
      currency = "€",
      decimals = 2,
      negativeInParens = true,
      allowNull = true,
      min,
      max,
      className,
      onBlur,
      onFocus,
      onKeyDown,
      disabled,
      ...rest
    },
    ref,
  ) {
    // Internal display state — der user sieht beim Tippen seine rohe Eingabe,
    // erst beim Blur wird normalisiert. Das verhindert spring-back-Bugs während
    // Komma-Eingabe.
    const [displayValue, setDisplayValue] = React.useState<string>(() => {
      if (value === null || value === "" || value === undefined) return "";
      return formatGermanAmount(value, decimals, negativeInParens);
    });
    const [isFocused, setIsFocused] = React.useState(false);
    const lastCommitted = React.useRef<number | null>(
      typeof value === "number" ? value : null,
    );

    // Externer Wertwechsel (z.B. Reset durch Form) → display syncen
    React.useEffect(() => {
      if (isFocused) return; // während Eingabe nicht stören
      if (value === null || value === "" || value === undefined) {
        setDisplayValue("");
        lastCommitted.current = null;
      } else {
        setDisplayValue(formatGermanAmount(value, decimals, negativeInParens));
        lastCommitted.current = value;
      }
    }, [value, decimals, negativeInParens, isFocused]);

    const commitParsed = React.useCallback(
      (raw: string) => {
        const parsed = parseGermanAmount(raw);
        if (parsed === null) {
          if (allowNull) {
            onChange(null);
            lastCommitted.current = null;
            setDisplayValue("");
          } else {
            // Fallback auf letzten gültigen Wert
            const fallback = lastCommitted.current ?? 0;
            onChange(fallback);
            setDisplayValue(formatGermanAmount(fallback, decimals, negativeInParens));
          }
          return;
        }
        let next = parsed;
        if (typeof min === "number" && next < min) next = min;
        if (typeof max === "number" && next > max) next = max;
        onChange(next);
        lastCommitted.current = next;
        setDisplayValue(formatGermanAmount(next, decimals, negativeInParens));
      },
      [onChange, allowNull, min, max, decimals, negativeInParens],
    );

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      commitParsed(displayValue);
      onBlur?.(e);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      // Beim Fokus auf reine Zahl reduzieren (Tausender-Punkte raus, Komma bleibt)
      if (lastCommitted.current !== null) {
        const raw = lastCommitted.current
          .toString()
          .replace(".", ",");
        setDisplayValue(raw);
        // Inhalt selektieren für sofortiges Überschreiben
        requestAnimationFrame(() => {
          e.target.select();
        });
      }
      onFocus?.(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        // Reset auf letzten committed Wert
        if (lastCommitted.current !== null) {
          setDisplayValue(formatGermanAmount(lastCommitted.current, decimals, negativeInParens));
        } else {
          setDisplayValue("");
        }
        e.currentTarget.blur();
        e.preventDefault();
        return;
      }
      onKeyDown?.(e);
    };

    return (
      <div className={cn("relative inline-flex items-center w-full", className)}>
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          // Aria-Hint: assistive Technologien sollen das als numerisch erkennen
          aria-roledescription="Geldbetrag in Euro"
          value={displayValue}
          onChange={(e) => setDisplayValue(e.target.value)}
          onBlur={handleBlur}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={cn(
            "tabular-currency w-full text-right pr-8 pl-3 py-2",
            "rounded-md border border-input bg-background text-sm",
            "ring-offset-background placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "transition-colors duration-150",
          )}
          {...rest}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 text-sm text-muted-foreground"
        >
          {currency}
        </span>
      </div>
    );
  },
);
