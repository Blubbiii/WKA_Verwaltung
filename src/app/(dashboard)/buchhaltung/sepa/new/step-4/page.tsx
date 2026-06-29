"use client";

/**
 * R-11 SEPA-Wizard — Step 4: Submit + Result.
 *
 * Auf Mount: POST /api/buchhaltung/sepa mit allen State-Daten. Single-Fire
 * Garantie via Module-Level submittedRef (StrictMode-double-mount-safe) +
 * useRef. Bei Success: Success-Card mit batchNumber, optionalen
 * AWV-Warnungen, XML-Download und 4-Augen-Hinweis. Bei Error: Retry zurück
 * zu Step 3 (User kann „Bestätigen" nochmal drücken).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Info,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AwvWarningsAlert,
  type AwvWarning,
} from "@/components/buchhaltung/AwvWarningsAlert";
import { useSepaWizardState } from "@/hooks/useSepaWizardState";

interface SepaBatchResponse {
  id: string;
  batchNumber: string;
  xmlContent: string;
}

interface ApiResponse {
  data: SepaBatchResponse;
  awvWarnings?: AwvWarning[];
}

export default function SepaWizardStep4() {
  const t = useTranslations("buchhaltung.sepaWizard");
  const router = useRouter();
  const { state, reset, hydrated } = useSepaWizardState();

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Single-Fire Guard — useRef überlebt StrictMode-Double-Mount,
  // bei zweitem Effect-Run schon `true` → Submit nicht nochmal.
  const submittedRef = useRef(false);

  // Guard: Pflichtfelder vorhanden?
  useEffect(() => {
    if (!hydrated) return;
    const ok =
      state.invoiceIds.length > 0 &&
      !!state.bankAccountId &&
      !!state.debtorName &&
      !!state.debtorIban &&
      !!state.executionDate;
    if (!ok) {
      router.replace("/buchhaltung/sepa/new/step-1");
    }
  }, [hydrated, state, router]);

  // Submit — nur einmal, sobald hydrated und Pflichtfelder ok.
  useEffect(() => {
    if (!hydrated) return;
    if (submittedRef.current) return;
    if (
      state.invoiceIds.length === 0 ||
      !state.bankAccountId ||
      !state.debtorName ||
      !state.debtorIban ||
      !state.executionDate
    ) {
      return;
    }

    submittedRef.current = true;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/buchhaltung/sepa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            executionDate: state.executionDate,
            debtorName: state.debtorName,
            debtorIban: state.debtorIban,
            debtorBic: state.debtorBic || undefined,
            invoiceIds: state.invoiceIds,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          const msg =
            (json && (json.error?.message || json.message)) ||
            t("step4ErrorTitle");
          throw new Error(msg);
        }
        if (!cancelled) setResult(json as ApiResponse);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : t("step4ErrorTitle"),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, state, t]);

  const downloadXml = useCallback(() => {
    if (!result?.data?.xmlContent) return;
    const blob = new Blob([result.data.xmlContent], {
      type: "application/xml",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.data.batchNumber}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const finish = useCallback(() => {
    reset();
    router.push("/buchhaltung/zahlungen?tab=sepa");
  }, [reset, router]);

  const retry = useCallback(() => {
    // Submit-Flag zurücksetzen, dann zurück zu Step 3 für erneuten "Bestätigen".
    submittedRef.current = false;
    setResult(null);
    setError(null);
    router.push("/buchhaltung/sepa/new/step-3");
  }, [router]);

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-8 pb-10 text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">{t("step4Loading")}</p>
          <div className="space-y-2 max-w-md mx-auto pt-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4 mx-auto" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t("step4ErrorTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <div className="flex justify-start">
            <Button variant="outline" onClick={retry}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("step4Retry")}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!result) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1 min-w-0">
              <h2 className="text-lg font-semibold">{t("step4SuccessTitle")}</h2>
              <p className="text-sm text-muted-foreground">
                {t("step4SuccessDescription", {
                  batchNumber: result.data.batchNumber,
                })}
              </p>
            </div>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>{t("step4FourEyesTitle") ?? "4-Augen-Prinzip"}</AlertTitle>
            <AlertDescription>
              {t("step4FourEyesHint")}{" "}
              <Link
                href="/admin/approvals"
                className="underline underline-offset-2 font-medium"
              >
                /admin/approvals
              </Link>
            </AlertDescription>
          </Alert>

          <div className="flex items-center gap-2 flex-wrap pt-2">
            <Button onClick={downloadXml} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              {t("step4DownloadXml")}
            </Button>
            <Button onClick={finish}>{t("step4Done")}</Button>
          </div>
        </CardContent>
      </Card>

      {result.awvWarnings && result.awvWarnings.length > 0 && (
        <AwvWarningsAlert warnings={result.awvWarnings} />
      )}
    </div>
  );
}
