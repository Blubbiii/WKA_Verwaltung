"use client";

/**
 * Picker with "create" as its last entry ("Aus der Auswahl anlegen").
 *
 * Wer beim Vertrag die Gesellschaft nicht fand, musste den Assistenten
 * verlassen, sie anlegen und neu anfangen. Hier steht unten
 * "+ Neue Gesellschaft anlegen"; das Formular öffnet als Dialog darüber, der
 * neue Eintrag ist danach ausgewählt und alle anderen Eingaben bleiben.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";

/** Option value that stands for "nothing selected" (cmdk needs a non-empty value). */
const KEINE = "__keine__";

export interface AnlegenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Text typed into the search, as prefill. */
  vorbelegung: string;
  /** Call with the new record — it is selected right away. */
  onAngelegt: (eintrag: { id: string; name: string }) => void;
}

export interface AuswahlMitAnlegenProps {
  optionen: ComboboxOption[];
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Adds an entry for "none", e.g. "Keine Gesellschaft"; selecting it yields "". */
  leerText?: string;
  /** Texts of the create entry. */
  texte: { neu: string; mitName: string };
  /** Without the permission to create, the entry is not shown. */
  darfAnlegen: boolean;
  /** Renders the create dialog. */
  dialog: (props: AnlegenDialogProps) => ReactNode;
  /** After creating, e.g. to refresh the option list. */
  onAngelegt?: (eintrag: { id: string; name: string }) => void;
  loading?: boolean;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  className?: string;
}

export function AuswahlMitAnlegen({
  optionen,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  leerText,
  texte,
  darfAnlegen,
  dialog,
  onAngelegt,
  loading,
  disabled,
  id,
  "aria-label": ariaLabel,
  className,
}: AuswahlMitAnlegenProps) {
  const [dialogOffen, setDialogOffen] = useState(false);
  const [vorbelegung, setVorbelegung] = useState("");
  // Shown until the refreshed list contains the new record, so the field
  // displays its name at once instead of the placeholder.
  const [neu, setNeu] = useState<ComboboxOption | null>(null);

  const alle = useMemo(() => {
    const liste = neu && !optionen.some((o) => o.value === neu.value) ? [...optionen, neu] : optionen;
    return leerText ? [{ value: KEINE, label: leerText }, ...liste] : liste;
  }, [optionen, neu, leerText]);

  return (
    <>
      <Combobox
        id={id}
        aria-label={ariaLabel}
        className={className}
        options={alle}
        value={value ? value : leerText ? KEINE : undefined}
        onChange={(v) => onChange(v === KEINE ? "" : v)}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        loading={loading}
        disabled={disabled}
        anlegen={
          darfAnlegen
            ? {
                ...texte,
                onAnlegen: (text) => {
                  setVorbelegung(text);
                  setDialogOffen(true);
                },
              }
            : undefined
        }
      />
      {darfAnlegen &&
        dialog({
          open: dialogOffen,
          onOpenChange: setDialogOffen,
          vorbelegung,
          onAngelegt: (eintrag) => {
            setDialogOffen(false);
            setNeu({ value: eintrag.id, label: eintrag.name });
            onChange(eintrag.id);
            onAngelegt?.(eintrag);
          },
        })}
    </>
  );
}
