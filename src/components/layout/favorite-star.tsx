"use client";

/**
 * Der Stern, mit dem eine Seite Favorit wird.
 *
 * ## Warum hier und nicht in den Einstellungen
 *
 * Man denkt „das brauche ich oft", **während man auf der Seite ist** — nicht
 * drei Klicks später in einem Konfigurationsdialog, wo man die Namen aller
 * Bildschirme aus dem Kopf abrufen müsste. Eine Favoritenverwaltung, die man
 * erst aufsuchen muss, füllt fast niemand.
 *
 * Deshalb steht der Stern dort, wo die Entscheidung fällt: am
 * Navigationseintrag und neben der Seitenüberschrift. Die Einstellungen sind
 * zum **Verwalten** da — sortieren, gruppieren, aufräumen —, nicht zum
 * Anlegen.
 *
 * ## Warum er nicht immer sichtbar ist
 *
 * In der Navigation erscheint er beim Überfahren und bleibt sichtbar, wenn er
 * gesetzt ist. Ein Stern an jedem der dreissig Einträge wäre eine zweite
 * Spalte Symbole neben der ersten — und die Leiste sollte gerade ruhiger
 * werden, nicht unruhiger.
 */

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useIstFavorit } from "@/components/layout/sidebar-prefs-provider";
import { cn } from "@/lib/utils";

export interface FavoriteStarProps {
  href: string;
  /** `nav` blendet den Stern aus, solange er nicht gesetzt ist. */
  variante?: "nav" | "page";
  className?: string;
}

export function FavoriteStar({ href, variante = "page", className }: FavoriteStarProps) {
  const t = useTranslations("sidebar.favorites");
  const { aktiv, umschalten } = useIstFavorit(href);

  return (
    <button
      type="button"
      onClick={(e) => {
        // In der Navigation liegt der Stern INNERHALB eines Links. Ohne das
        // hier wuerde jeder Klick auf den Stern auch navigieren.
        e.preventDefault();
        e.stopPropagation();
        umschalten();
      }}
      /*
        Nicht in der Tastaturreihenfolge, solange er unsichtbar ist.
        `opacity-0` nimmt ein Element NICHT aus dem Tabulator-Ablauf — ein
        Tastaturnutzer haette sich durch dreissig unsichtbare Sterne gearbeitet,
        bevor er den ersten Menuepunkt erreicht.

        Verloren geht dabei nichts: derselbe Stern steht immer sichtbar neben
        der Seitenueberschrift. Wer mit der Tastatur arbeitet, nimmt den.
      */
      tabIndex={variante === "nav" && !aktiv ? -1 : undefined}
      title={aktiv ? t("remove") : t("add")}
      aria-label={aktiv ? t("remove") : t("add")}
      aria-pressed={aktiv}
      className={cn(
        "rounded-sm p-1 transition-opacity",
        "hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        // Gesetzt: immer sichtbar. Nicht gesetzt: in der Navigation erst beim
        // Ueberfahren, damit die Leiste ruhig bleibt.
        variante === "nav" && !aktiv && "opacity-0 group-hover:opacity-100 focus:opacity-100",
        className,
      )}
    >
      <Star
        className={cn(
          "h-3.5 w-3.5",
          aktiv
            ? "fill-amber-400 text-amber-400"
            : "text-muted-foreground",
        )}
      />
    </button>
  );
}
