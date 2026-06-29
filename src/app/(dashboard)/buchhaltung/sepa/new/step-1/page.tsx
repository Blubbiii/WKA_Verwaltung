"use client";

/**
 * R-11 SEPA-Wizard — Step 1.
 *
 * "Welche Rechnungen sollen bezahlt werden?"
 *
 * Listet alle Rechnungen mit Status SENT. Multi-Select via Checkbox pro Row
 * sowie Header-Checkbox für "alle". Suche filtert clientseitig auf
 * Rechnungsnummer/Empfänger. Footer-Summary zeigt Auswahl und Summe.
 *
 * State wird über `useSepaWizardState` in localStorage gespiegelt — so
 * überleben getroffene Entscheidungen Navigation zwischen Steps und Refresh.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowRight, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import { useSepaWizardState } from "@/hooks/useSepaWizardState";

interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  recipientName: string | null;
  grossAmount: string;
  shareholder?: {
    id: string;
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

export default function SepaWizardStep1() {
  const t = useTranslations("buchhaltung.sepaWizard");
  const router = useRouter();
  const { state, setState, hydrated } = useSepaWizardState();

  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const abortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
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
      if (!ac.signal.aborted) setInvoices(json.data || []);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error(t("toastCreateFailed"));
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
    return () => abortRef.current?.abort();
  }, [fetchData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter((inv) => {
      const recipient = recipientLabel(inv).toLowerCase();
      return (
        inv.invoiceNumber.toLowerCase().includes(q) || recipient.includes(q)
      );
    });
  }, [invoices, search]);

  const selectedIds = useMemo(() => new Set(state.invoiceIds), [state.invoiceIds]);

  const selectedCount = state.invoiceIds.length;
  const selectedTotal = useMemo(() => {
    return invoices
      .filter((i) => selectedIds.has(i.id))
      .reduce((sum, i) => sum + Number(i.grossAmount), 0);
  }, [invoices, selectedIds]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((i) => selectedIds.has(i.id));
  const someFilteredSelected = filtered.some((i) => selectedIds.has(i.id));

  const toggleOne = useCallback(
    (id: string, checked: boolean) => {
      setState((prev) => {
        const next = new Set(prev.invoiceIds);
        if (checked) next.add(id);
        else next.delete(id);
        return { invoiceIds: Array.from(next) };
      });
    },
    [setState],
  );

  const toggleAll = useCallback(
    (checked: boolean) => {
      setState((prev) => {
        const next = new Set(prev.invoiceIds);
        if (checked) {
          for (const inv of filtered) next.add(inv.id);
        } else {
          for (const inv of filtered) next.delete(inv.id);
        }
        return { invoiceIds: Array.from(next) };
      });
    },
    [filtered, setState],
  );

  const goNext = useCallback(() => {
    if (selectedCount === 0) return;
    router.push("/buchhaltung/sepa/new/step-2");
  }, [router, selectedCount]);

  if (!hydrated) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{t("step1Title")}</h2>
          <p className="text-sm text-muted-foreground">{t("step1Description")}</p>
        </div>

        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("step1SearchPlaceholder")}
            className="pl-9"
          />
        </div>

        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={
                      allFilteredSelected
                        ? true
                        : someFilteredSelected
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={(c) => toggleAll(c === true)}
                    disabled={filtered.length === 0}
                    aria-label="select all"
                  />
                </TableHead>
                <TableHead>{t("colInvoiceNumber") ?? "Rechnungs-Nr."}</TableHead>
                <TableHead>{t("colRecipient") ?? "Empfänger"}</TableHead>
                <TableHead>{t("colDate") ?? "Datum"}</TableHead>
                <TableHead className="text-right">
                  {t("colAmount") ?? "Betrag"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-10"
                  >
                    {t("step1EmptyState")}
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-10"
                  >
                    {t("step1NoMatches")}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((inv) => {
                  const checked = selectedIds.has(inv.id);
                  return (
                    <TableRow
                      key={inv.id}
                      data-state={checked ? "selected" : undefined}
                    >
                      <TableCell>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) => toggleOne(inv.id, c === true)}
                          aria-label={inv.invoiceNumber}
                        />
                      </TableCell>
                      <TableCell className="font-mono">
                        {inv.invoiceNumber}
                      </TableCell>
                      <TableCell>{recipientLabel(inv)}</TableCell>
                      <TableCell>{formatDate(inv.invoiceDate)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(inv.grossAmount)}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between gap-4 flex-wrap pt-2 border-t">
          <p className="text-sm text-muted-foreground">
            {t("step1SelectedSummary", {
              count: selectedCount,
              total: formatCurrency(selectedTotal),
            })}
          </p>
          <Button onClick={goNext} disabled={selectedCount === 0}>
            {t("next")}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
