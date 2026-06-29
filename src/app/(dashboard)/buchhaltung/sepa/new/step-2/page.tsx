"use client";

/**
 * R-11 SEPA-Wizard — Step 2.
 *
 * "Von welchem Konto wird gezahlt + wann?"
 *
 * Listet aktive Bankkonten als Radio-Cards (Name, IBAN formatiert, BIC,
 * aktueller Saldo). Date-Picker für `executionDate` mit Default heute +2
 * Werktage (vereinfacht: heute + 2 Kalendertage).
 *
 * Bei Konto-Auswahl werden debtorName/IBAN/BIC aus dem Konto-Objekt
 * extrahiert und in den Wizard-State geschrieben — Step 3/4 brauchen
 * keinen weiteren Lookup.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/format";
import { useSepaWizardState } from "@/hooks/useSepaWizardState";

interface BankAccount {
  id: string;
  name: string;
  iban: string;
  bic: string | null;
  bankName: string | null;
  currency: string;
  currentBalance: string | null;
}

function formatIban(iban: string): string {
  const clean = iban.replace(/\s/g, "").toUpperCase();
  return clean.match(/.{1,4}/g)?.join(" ") ?? clean;
}

function defaultExecutionDate(): string {
  const d = new Date(Date.now() + 2 * 86400000);
  // YYYY-MM-DD (local-timezone-safe via UTC slice)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function SepaWizardStep2() {
  const t = useTranslations("buchhaltung.sepaWizard");
  const router = useRouter();
  const { state, setState, hydrated } = useSepaWizardState();

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  // Guard: ohne Rechnungen direkt zurück.
  useEffect(() => {
    if (hydrated && state.invoiceIds.length === 0) {
      router.replace("/buchhaltung/sepa/new/step-1");
    }
  }, [hydrated, state.invoiceIds.length, router]);

  // Default executionDate setzen, sobald hydrated und noch leer.
  useEffect(() => {
    if (hydrated && !state.executionDate) {
      setState({ executionDate: defaultExecutionDate() });
    }
  }, [hydrated, state.executionDate, setState]);

  const fetchAccounts = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    try {
      const res = await fetch("/api/buchhaltung/bank/accounts", {
        signal: ac.signal,
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      if (!ac.signal.aborted) setAccounts(json.data || []);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error(t("toastCreateFailed"));
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchAccounts();
    return () => abortRef.current?.abort();
  }, [fetchAccounts]);

  const minDate = useMemo(() => todayIso(), []);

  const handleAccountSelect = useCallback(
    (id: string) => {
      const acc = accounts.find((a) => a.id === id);
      if (!acc) return;
      setState({
        bankAccountId: acc.id,
        debtorName: acc.name,
        debtorIban: acc.iban,
        debtorBic: acc.bic ?? "",
      });
    },
    [accounts, setState],
  );

  const canProceed =
    !!state.bankAccountId && !!state.executionDate && hydrated;

  const goNext = useCallback(() => {
    if (!canProceed) return;
    router.push("/buchhaltung/sepa/new/step-3");
  }, [canProceed, router]);

  const goBack = useCallback(() => {
    router.push("/buchhaltung/sepa/new/step-1");
  }, [router]);

  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">{t("step2Title")}</h2>
          <p className="text-sm text-muted-foreground">{t("step2Description")}</p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t("step2NoBankAccounts")}
          </div>
        ) : (
          <RadioGroup
            value={state.bankAccountId ?? ""}
            onValueChange={handleAccountSelect}
            className="gap-3"
          >
            {accounts.map((acc) => {
              const selected = state.bankAccountId === acc.id;
              return (
                <Label
                  key={acc.id}
                  htmlFor={`acc-${acc.id}`}
                  className={
                    "flex items-start gap-3 rounded-md border p-4 cursor-pointer transition-colors " +
                    (selected
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50")
                  }
                >
                  <RadioGroupItem
                    id={`acc-${acc.id}`}
                    value={acc.id}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden />
                      <span className="font-medium">{acc.name}</span>
                      {acc.bankName && (
                        <span className="text-xs text-muted-foreground">
                          · {acc.bankName}
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-mono mt-1 break-all">
                      {formatIban(acc.iban)}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                      {acc.bic && (
                        <span>
                          BIC: <span className="font-mono">{acc.bic}</span>
                        </span>
                      )}
                      {acc.currentBalance !== null && (
                        <span>
                          {t("step2BalanceLabel")}:{" "}
                          <span className="font-mono text-foreground">
                            {formatCurrency(acc.currentBalance)}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </Label>
              );
            })}
          </RadioGroup>
        )}

        <div className="space-y-2 max-w-xs">
          <Label htmlFor="executionDate">{t("step2ExecutionDateLabel")}</Label>
          <Input
            id="executionDate"
            type="date"
            min={minDate}
            value={state.executionDate}
            onChange={(e) => setState({ executionDate: e.target.value })}
          />
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <Button variant="outline" onClick={goBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("back")}
          </Button>
          <Button onClick={goNext} disabled={!canProceed}>
            {t("next")}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
