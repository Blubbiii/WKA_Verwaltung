"use client";

/**
 * R-11 SEPA-Wizard — Step 3.
 *
 * "Bitte prüfen und bestätigen."
 *
 * Zweispaltige Review-Card mit Auftraggeber-Daten (links) und
 * Zusammenfassung (rechts) sowie scrollbarer Rechnungsliste darunter.
 * Bewusst KEIN XML-Preview — der XML wird beim Submit in Step 4 erzeugt.
 *
 * Guard: ohne Rechnungen oder Bankkonto direkt zurück zu Step 1.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate } from "@/lib/format";
import { useSepaWizardState } from "@/hooks/useSepaWizardState";

interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  recipientName: string | null;
  grossAmount: string;
  shareholder?: {
    person: {
      firstName: string | null;
      lastName: string | null;
      companyName: string | null;
    };
  } | null;
}

function recipientLabel(inv: InvoiceListItem): string {
  const p = inv.shareholder?.person;
  if (p?.companyName) return p.companyName;
  const name = `${p?.firstName ?? ""} ${p?.lastName ?? ""}`.trim();
  return name || inv.recipientName || "—";
}

function formatIban(iban: string): string {
  const clean = iban.replace(/\s/g, "").toUpperCase();
  return clean.match(/.{1,4}/g)?.join(" ") ?? clean;
}

export default function SepaWizardStep3() {
  const t = useTranslations("buchhaltung.sepaWizard");
  const router = useRouter();
  const { state, hydrated } = useSepaWizardState();

  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  // Guard: ohne State-Pflichtfelder zurück zu Step 1.
  useEffect(() => {
    if (!hydrated) return;
    if (state.invoiceIds.length === 0 || !state.bankAccountId) {
      router.replace("/buchhaltung/sepa/new/step-1");
    }
  }, [hydrated, state.invoiceIds.length, state.bankAccountId, router]);

  const fetchInvoices = useCallback(async () => {
    if (!hydrated || state.invoiceIds.length === 0) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    try {
      const res = await fetch("/api/invoices?status=SENT&limit=100", {
        signal: ac.signal,
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      const all: InvoiceListItem[] = json.data || [];
      const set = new Set(state.invoiceIds);
      if (!ac.signal.aborted) setInvoices(all.filter((i) => set.has(i.id)));
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error(t("toastCreateFailed"));
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [hydrated, state.invoiceIds, t]);

  useEffect(() => {
    fetchInvoices();
    return () => abortRef.current?.abort();
  }, [fetchInvoices]);

  const total = useMemo(
    () => invoices.reduce((s, i) => s + Number(i.grossAmount), 0),
    [invoices],
  );

  const goBack = useCallback(() => {
    router.push("/buchhaltung/sepa/new/step-2");
  }, [router]);

  const goNext = useCallback(() => {
    router.push("/buchhaltung/sepa/new/step-4");
  }, [router]);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6 space-y-2">
          <h2 className="text-lg font-semibold">{t("step3Title")}</h2>
          <p className="text-sm text-muted-foreground">{t("step3Description")}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Auftraggeber */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <h3 className="font-medium text-sm uppercase tracking-wide text-muted-foreground">
              {t("step3DebtorHeading")}
            </h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">
                  {t("step3DebtorName") ?? "Name"}
                </dt>
                <dd className="font-medium">{state.debtorName || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">IBAN</dt>
                <dd className="font-mono break-all">
                  {state.debtorIban ? formatIban(state.debtorIban) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">BIC</dt>
                <dd className="font-mono">{state.debtorBic || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  {t("step2ExecutionDateLabel")}
                </dt>
                <dd>
                  {state.executionDate ? formatDate(state.executionDate) : "—"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Zusammenfassung */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <h3 className="font-medium text-sm uppercase tracking-wide text-muted-foreground">
              {t("step3SummaryHeading")}
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">
                  {t("step3InvoiceCount") ?? "Rechnungen"}
                </dt>
                <dd className="font-mono font-medium">
                  {state.invoiceIds.length}
                </dd>
              </div>
              <div className="flex items-center justify-between border-t pt-2">
                <dt className="text-muted-foreground">
                  {t("step3TotalAmount") ?? "Summe"}
                </dt>
                <dd className="font-mono font-medium text-base">
                  {formatCurrency(total)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Rechnungen */}
      <Card>
        <CardContent className="pt-6 space-y-3">
          <h3 className="font-medium text-sm uppercase tracking-wide text-muted-foreground">
            {t("step3InvoicesHeading")}
          </h3>
          <div className="max-h-72 overflow-auto rounded-md border divide-y">
            {loading ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-full" />
                ))}
              </div>
            ) : (
              invoices.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs text-muted-foreground">
                      {inv.invoiceNumber}
                    </div>
                    <div className="truncate">{recipientLabel(inv)}</div>
                  </div>
                  <div className="font-mono font-medium shrink-0">
                    {formatCurrency(inv.grossAmount)}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={goBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("back")}
        </Button>
        <Button onClick={goNext}>
          <Check className="h-4 w-4 mr-2" />
          {t("confirm")}
        </Button>
      </div>
    </div>
  );
}
