"use client";

/**
 * Detailgrad der Tabellen — kompakt oder normal.
 *
 * ## Warum es das gibt
 *
 * Die Dokumentenliste zeigte sieben Zeilen auf achthundert Pixeln. Wer täglich
 * dreihundert Flurstücke abgleicht, scrollt damit den halben Tag. Wer einmal
 * im Monat eine Rechnung sucht, will es luftig.
 *
 * Beides ist richtig, und beides gleichzeitig geht nicht. Also entscheidet es
 * der Nutzer — einmal, und es bleibt.
 *
 * ## Warum über ein Attribut am Dokument
 *
 * Es gibt rund 169 Listen im Produkt. Ein Schalter, der sie einzeln anfassen
 * müsste, wäre nie fertig und würde bei jeder neuen Liste wieder vergessen.
 * Stattdessen setzt er ein Attribut am `<html>`, und die Zellenpolsterung
 * kommt aus einer CSS-Variablen — jede Tabelle folgt, auch die, die es noch
 * nicht gibt.
 *
 * ## Warum kein dritter Grad
 *
 * „Kompakt / normal / gemütlich" klingt gründlicher und ist es nicht: beim
 * dritten Wert fängt man an zu überlegen, welcher gerade an ist. Zwei Zustände
 * kann man umschalten, ohne hinzusehen.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Rows2, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";

const SPEICHER_SCHLUESSEL = "wpm.density";

export function DensityToggle() {
  const t = useTranslations("common.density");
  const [kompakt, setKompakt] = useState(false);

  // Erst nach dem Einhaengen lesen: auf dem Server gibt es keinen
  // localStorage, und ein Unterschied zwischen Server- und Client-Ausgabe
  // fuehrt zu einem Hydrierungsfehler.
  useEffect(() => {
    try {
      const gespeichert = window.localStorage.getItem(SPEICHER_SCHLUESSEL);
      if (gespeichert === "compact") {
        setKompakt(true);
        document.documentElement.setAttribute("data-density", "compact");
      }
    } catch {
      // Gesperrter Speicher — dann eben in der Voreinstellung.
    }
  }, []);

  function umschalten() {
    const neu = !kompakt;
    setKompakt(neu);
    if (neu) {
      document.documentElement.setAttribute("data-density", "compact");
    } else {
      document.documentElement.removeAttribute("data-density");
    }
    try {
      window.localStorage.setItem(SPEICHER_SCHLUESSEL, neu ? "compact" : "normal");
    } catch {
      // Gilt dann nur fuer diese Sitzung.
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={umschalten}
      // Der Titel sagt, was PASSIERT, nicht was gerade ist. "Kompakte
      // Ansicht" an einer eingeschalteten kompakten Ansicht liest sich wie
      // eine Zustandsanzeige und laesst offen, was ein Klick tut.
      title={kompakt ? t("toNormal") : t("toCompact")}
      aria-label={kompakt ? t("toNormal") : t("toCompact")}
      aria-pressed={kompakt}
      className="h-9 w-9 text-muted-foreground hover:text-foreground"
    >
      {kompakt ? <Rows3 className="h-4 w-4" /> : <Rows2 className="h-4 w-4" />}
    </Button>
  );
}
