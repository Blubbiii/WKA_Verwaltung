"use client";

/**
 * GwG identity check of one person: current state, history count and the
 * way to record a new check. Shown in the shareholder detail dialog.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheck, Plus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/useApiQuery";
import { AmlCheckDialog } from "./aml-check-dialog";

export interface AmlCheckEintrag {
  id: string;
  status: string;
  identifiedAt: string | null;
  nextReviewAt: string | null;
  createdAt: string;
  person: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
  };
  state: {
    isValid: boolean;
    reviewDue: boolean;
    reviewInDays: number | null;
    problems: string[];
    warnings: string[];
    statement: string;
  };
}

export function AmlSection({ personId, personName }: { personId: string; personName: string }) {
  const t = useTranslations("aml");
  const [dialogOffen, setDialogOffen] = useState(false);

  const { data, isLoading, error } = useApiQuery<{ data: AmlCheckEintrag[] }>(
    ["aml-checks", personId],
    `/api/aml-checks?personId=${personId}`,
  );
  // Newest first (server orders by createdAt desc).
  const pruefungen = data?.data ?? [];
  const aktuell = pruefungen[0];

  // Without shareholders:read the section has nothing to show.
  if (error) return null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="font-medium">{t("title")}</h4>
        <Button size="sm" variant="outline" onClick={() => setDialogOffen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          {aktuell ? t("recordAgain") : t("record")}
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : !aktuell ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <div className="space-y-1 text-sm">
          <p
            className={`flex items-start gap-2 ${aktuell.state.isValid ? "" : "text-destructive"}`}
          >
            {aktuell.state.isValid ? (
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden />
            ) : (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            )}
            {aktuell.state.statement}
          </p>
          {aktuell.state.reviewInDays !== null && aktuell.state.reviewDue && (
            <p className="text-amber-600">
              {aktuell.state.reviewInDays < 0
                ? t("reviewOverdue", { days: -aktuell.state.reviewInDays })
                : t("reviewIn", { days: aktuell.state.reviewInDays })}
            </p>
          )}
          {aktuell.state.warnings.slice(0, 2).map((w) => (
            <p key={w} className="text-xs text-muted-foreground">
              {w}
            </p>
          ))}
          {pruefungen.length > 1 && (
            <p className="text-xs text-muted-foreground">
              {t("history", { count: pruefungen.length })}
            </p>
          )}
        </div>
      )}

      <AmlCheckDialog
        open={dialogOffen}
        onOpenChange={setDialogOffen}
        personId={personId}
        personName={personName}
      />
    </div>
  );
}
