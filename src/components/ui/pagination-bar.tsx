"use client";

/**
 * Blätterleiste unter einer Tabelle.
 *
 * Bedienaufwand #2 (Audit 2026-07): Vier der meistgenutzten Listen — Rechnungen,
 * Verträge, Pachtverträge, Lieferanten — luden bis zu 200 Zeilen an, bekamen von
 * der API höchstens 100 (`parsePaginationParams`, maxLimit 100) und zeigten
 * **keinen Hinweis**, dass abgeschnitten wurde. Wer den 101. Beleg suchte, bekam
 * „nichts gefunden" — für einen Beleg, den es gibt.
 *
 * Das Markup selbst gab es schon viermal fast identisch (service-events,
 * audit-logs, crm/contacts, failed-jobs). Statt es ein fünftes Mal zu kopieren
 * steht es hier einmal.
 *
 * Die Leiste rendert bewusst AUCH bei einer einzigen Seite, sobald `alwaysShow`
 * gesetzt ist: „1–37 von 37" ist die Auskunft, die vorher gefehlt hat. Ohne sie
 * ist eine kurze Liste nicht von einer abgeschnittenen zu unterscheiden.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface PaginationBarProps {
  pagination: PaginationInfo | undefined;
  onPageChange: (page: number) => void;
  /** Auch bei nur einer Seite anzeigen (dann nur die Zählung, ohne Knöpfe). */
  alwaysShow?: boolean;
  /** Blockiert die Knöpfe, während nachgeladen wird. */
  disabled?: boolean;
}

export function PaginationBar({
  pagination,
  onPageChange,
  alwaysShow = true,
  disabled = false,
}: PaginationBarProps) {
  const t = useTranslations("common.pagination");

  if (!pagination || pagination.total === 0) return null;

  const { page, limit, total, totalPages } = pagination;
  const multiPage = totalPages > 1;
  if (!multiPage && !alwaysShow) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground tabular-nums">
        {t("range", { from, to, total })}
      </p>

      {multiPage && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
            {t("previous")}
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            {t("pageOf", { page, totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            {t("next")}
            <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}
