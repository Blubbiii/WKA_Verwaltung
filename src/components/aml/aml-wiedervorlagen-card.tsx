"use client";

/**
 * GwG checks that are due for resubmission or no longer valid
 * (GET /api/aml-checks?dueOnly=true — the server looks at the newest check
 * per person only).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/hooks/useApiQuery";
import { AmlCheckDialog } from "./aml-check-dialog";
import type { AmlCheckEintrag } from "./aml-section";

function name(p: AmlCheckEintrag["person"]) {
  return p.companyName || [p.firstName, p.lastName].filter(Boolean).join(" ") || "–";
}

export function AmlWiedervorlagenCard() {
  const t = useTranslations("aml");
  const [auswahl, setAuswahl] = useState<AmlCheckEintrag | null>(null);

  const { data, error } = useApiQuery<{ data: AmlCheckEintrag[] }>(
    ["aml-checks", "due"],
    "/api/aml-checks?dueOnly=true",
  );
  const faellig = data?.data ?? [];
  // Hidden without shareholders:read (403) and when nothing is due.
  if (error || faellig.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-600" aria-hidden />
          {t("dueTitle", { count: faellig.length })}
        </CardTitle>
        <CardDescription>{t("dueDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {faellig.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{name(c.person)}</p>
                <p className={c.state.isValid ? "text-amber-600" : "text-destructive"}>
                  {c.state.isValid && c.state.reviewInDays !== null
                    ? c.state.reviewInDays < 0
                      ? t("reviewOverdue", { days: -c.state.reviewInDays })
                      : t("reviewIn", { days: c.state.reviewInDays })
                    : c.state.statement}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setAuswahl(c)}>
                {t("recordAgain")}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
      {auswahl && (
        <AmlCheckDialog
          open={!!auswahl}
          onOpenChange={(o) => !o && setAuswahl(null)}
          personId={auswahl.person.id}
          personName={name(auswahl.person)}
        />
      )}
    </Card>
  );
}
