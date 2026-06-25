"use client";

/**
 * AWV-Warnungen-Display für SEPA-Läufe.
 *
 * Zeigt eine Liste der vom Backend zurückgegebenen AWV-Meldepflicht-Warnungen
 * (§11 AWG, §67 AWV) nach erfolgreichem SEPA-Batch-Create.
 *
 * Wird typischerweise in einem Dialog nach dem POST /api/buchhaltung/sepa
 * gerendert, kann aber auch standalone unterhalb einer SEPA-Übersicht
 * eingebunden werden.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, FileWarning } from "lucide-react";
import { LOCALE_DE } from "@/lib/format";

export interface AwvWarning {
  endToEndId: string;
  creditorName: string;
  amount: number;
  country: string | null;
  reason: string;
  reportingForm: string;
}

function fmtEur(n: number): string {
  return n.toLocaleString(LOCALE_DE, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface Props {
  warnings: AwvWarning[];
  /** Optional: Card-Wrapping aus. Standard: true. */
  asCard?: boolean;
}

export function AwvWarningsAlert({ warnings, asCard = true }: Props) {
  if (warnings.length === 0) return null;

  const totalReportable = warnings.reduce((s, w) => s + w.amount, 0);

  const body = (
    <>
      <Alert variant="default" className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
        <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400" />
        <AlertTitle className="text-amber-900 dark:text-amber-200">
          Manuelle Bundesbank-Meldung erforderlich
        </AlertTitle>
        <AlertDescription className="text-amber-900/90 dark:text-amber-100/90">
          Für {warnings.length}{" "}
          {warnings.length === 1 ? "Zahlung" : "Zahlungen"} im Gesamtwert von{" "}
          <span className="font-mono font-medium">{fmtEur(totalReportable)}</span>{" "}
          besteht AWV-Meldepflicht nach §11 AWG, §67 AWV. Die Meldung muss
          eigenständig über das Bundesbank-Portal erfolgen.
        </AlertDescription>
      </Alert>

      <div className="space-y-2 mt-4">
        {warnings.map((w, idx) => (
          <div
            key={`${w.endToEndId}-${idx}`}
            className="rounded-md border bg-card p-3 text-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{w.creditorName}</span>
                  {w.country && (
                    <Badge variant="outline" className="text-xs">
                      {w.country}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs font-mono">
                    {w.reportingForm}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  E2E-ID: <span className="font-mono">{w.endToEndId}</span>
                </div>
                <div className="text-xs mt-1.5 text-foreground/80">
                  <span className="font-medium">Begründung:</span> {w.reason}
                </div>
                <div className="text-xs mt-1 text-muted-foreground">
                  Empfehlung: Z4-Meldung an die Bundesbank
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono font-medium text-sm">
                  {fmtEur(w.amount)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );

  if (!asCard) return <div>{body}</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileWarning className="h-4 w-4 text-amber-600" />
          AWV-Meldepflicht erkannt
        </CardTitle>
        <CardDescription className="text-xs">
          {warnings.length} meldepflichtige{" "}
          {warnings.length === 1 ? "Zahlung" : "Zahlungen"} im aktuellen SEPA-Lauf
        </CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
