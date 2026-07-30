"use client";

/**
 * Betragsfeld, das deutsche Schreibweise annimmt.
 *
 * Bedienaufwand #17 (Audit 2026-07): Die Formulare stehen auf
 * `<Input type="number">` und lesen mit `parseFloat(e.target.value) || 0` aus.
 * Fügt jemand „1.234,56" ein, liefert ein Number-Input einen LEEREN Wert — die
 * Rechnungsposition wird stillschweigend 0,00 €.
 *
 * Deshalb `type="text"` mit `inputMode="decimal"`: Das Feld nimmt jede
 * Schreibweise entgegen, meldet Unlesbares als Fehler statt es zu 0 zu machen,
 * und blendet auf Mobilgeräten trotzdem die Zifferntastatur ein.
 *
 * Der Nachteil von `type="text"` — keine Pfeiltasten zum Hoch-/Runterzählen —
 * ist bei Geldbeträgen keiner: niemand zählt einen Rechnungsbetrag in
 * Einerschritten hoch.
 *
 * ## Zusammenspiel mit dem Formularzustand
 *
 * Das Feld hält den ROHTEXT selbst, solange es den Fokus hat. Würde bei jedem
 * Tastendruck der geparste Wert zurück in den Text übersetzt, ließe sich „1,"
 * gar nicht tippen — die 1 käme als „1,00" zurück und der Cursor spränge.
 * Beim Verlassen des Feldes wird einmal sauber formatiert.
 */

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { parseAmount, formatAmountForInput } from "@/lib/parse-amount";

export interface AmountInputProps
  extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> {
  /** Der Wert. `null` heisst „leer", nicht 0. */
  value: number | null;
  /**
   * Wird bei jeder Änderung gerufen — mit `null`, solange die Eingabe nicht
   * lesbar ist. Der Aufrufer entscheidet, ob das ein Fehler ist oder 0 bedeutet.
   */
  onValueChange: (value: number | null) => void;
  /** Nachkommastellen beim Formatieren nach dem Verlassen des Feldes. */
  decimals?: number;
  /**
   * Zeigt einen roten Rahmen, solange die Eingabe nicht lesbar ist. Standard an —
   * eine unlesbare Eingabe soll man sehen.
   */
  showInvalid?: boolean;
}

export function AmountInput({
  value,
  onValueChange,
  decimals = 2,
  showInvalid = true,
  className,
  onBlur,
  onFocus,
  ...rest
}: AmountInputProps) {
  const [text, setText] = React.useState(() => formatAmountForInput(value, decimals));
  const [focused, setFocused] = React.useState(false);

  // Änderungen von aussen übernehmen — aber nur, wenn das Feld gerade NICHT
  // bearbeitet wird. Sonst überschreibt eine Neuberechnung des Formulars die
  // halb getippte Zahl unter den Fingern des Benutzers.
  React.useEffect(() => {
    if (focused) return;
    setText(formatAmountForInput(value, decimals));
  }, [value, decimals, focused]);

  const parsed = parseAmount(text);
  const invalid = showInvalid && text.trim() !== "" && parsed === null;

  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      value={text}
      aria-invalid={invalid || undefined}
      className={cn(invalid && "border-destructive focus-visible:ring-destructive", className)}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        onValueChange(next.trim() === "" ? null : parseAmount(next));
      }}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        // Einmal sauber formatieren — aber nur, wenn lesbar. Unlesbares stehen
        // lassen, damit der Benutzer sieht, was er getippt hat, statt vor einem
        // stillschweigend geleerten Feld zu stehen.
        const final = parseAmount(e.target.value);
        if (final !== null) setText(formatAmountForInput(final, decimals));
        onBlur?.(e);
      }}
    />
  );
}
