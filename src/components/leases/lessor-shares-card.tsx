"use client";

/**
 * Miteigentumsanteile am Pachtvertrag.
 *
 * A5 (Audit 2026-07): `Lease.lessorId` ist genau EINE Person. Nach 20 Jahren
 * Laufzeit ist die Erbengemeinschaft der Normalfall, ebenso der
 * Flurstücksverkauf mitten in der Periode.
 *
 * ## Zwei Dinge, die diese Maske bewusst so macht
 *
 * **Sie prüft beim Speichern, nicht beim Abrechnen.** Eine Lücke in den
 * Quoten fällt sonst erst auf, wenn ein Miteigentümer sich meldet — ein halbes
 * Jahr später, nach der Gutschrift.
 *
 * **Sie zeigt die laufende Summe an, während getippt wird.** Die 100-%-Regel
 * gilt je Stichtag; wer sie erst beim Absenden erfährt, muss raten, welche
 * Zeile schuld ist.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Plus, Save, Trash2, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { useApiQuery, useInvalidateQuery } from "@/hooks/useApiQuery";
import { PAGE_SIZE_DROPDOWN } from "@/lib/config/pagination";

interface PersonRef {
  id: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  personType: string;
  iban: string | null;
}

interface ShareRow {
  /** Nur clientseitig, damit React die Zeilen unterscheiden kann. */
  key: string;
  personId: string;
  sharePercent: string;
  validFrom: string;
  validTo: string;
  bankIban: string;
  notes: string;
}

interface LessorSharesResponse {
  shares: {
    id: string;
    personId: string;
    sharePercent: string;
    validFrom: string | null;
    validTo: string | null;
    bankIban: string | null;
    notes: string | null;
    person: PersonRef;
  }[];
  source: "LEASE_LESSORS" | "SINGLE_LESSOR_FALLBACK" | null;
  fallbackLessor: PersonRef | null;
  problems: string[];
}

function personLabel(person: PersonRef): string {
  return (
    person.companyName ||
    [person.firstName, person.lastName].filter(Boolean).join(" ") ||
    person.id
  );
}

function isoDay(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

export function LessorSharesCard({ leaseId }: { leaseId: string }) {
  const t = useTranslations("lessorShares");
  const invalidate = useInvalidateQuery();

  const { data, isLoading } = useApiQuery<LessorSharesResponse>(
    ["lease-lessors", leaseId],
    `/api/leases/${leaseId}/lessors`,
  );

  const [rows, setRows] = useState<ShareRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [personSearch, setPersonSearch] = useState("");
  // Zaehler statt Index: nach Hinzufuegen, Loeschen, Hinzufuegen waere der
  // Index doppelt und React zoege die falsche Zeile zusammen.
  const nextKey = useRef(0);

  // Der Serverstand ist die Vorlage; erst eine Änderung macht daraus einen
  // Entwurf. Ohne diesen Reset überschriebe ein Reload die Eingaben nicht.
  useEffect(() => {
    if (!data) return;
    setRows(
      data.shares.map((share, index) => ({
        key: `${share.id}-${index}`,
        personId: share.personId,
        sharePercent: String(Number(share.sharePercent)).replace(".", ","),
        validFrom: isoDay(share.validFrom),
        validTo: isoDay(share.validTo),
        bankIban: share.bankIban ?? "",
        notes: share.notes ?? "",
      })),
    );
  }, [data]);

  const { data: personsData, isLoading: personsLoading } = useApiQuery<{ data: PersonRef[] }>(
    ["persons-for-lessor-shares", personSearch],
    `/api/persons?limit=${PAGE_SIZE_DROPDOWN}${
      personSearch ? `&search=${encodeURIComponent(personSearch)}` : ""
    }`,
  );

  const personOptions: ComboboxOption[] = (personsData?.data ?? []).map(
    (person) => ({
      value: person.id,
      label: personLabel(person),
      description: person.iban ? `IBAN ${person.iban.slice(0, 8)}…` : undefined,
    }),
  );

  const update = useCallback((key: string, patch: Partial<ShareRow>) => {
    setRows((current) =>
      current ? current.map((row) => (row.key === key ? { ...row, ...patch } : row)) : current,
    );
  }, []);

  async function save() {
    if (!rows) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leases/${leaseId}/lessors`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shares: rows
            .filter((row) => row.personId)
            .map((row) => ({
              personId: row.personId,
              sharePercent: Number(row.sharePercent.replace(",", ".")) || 0,
              validFrom: row.validFrom || null,
              validTo: row.validTo || null,
              bankIban: row.bankIban || null,
              notes: row.notes || null,
            })),
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        // Die Begründung des Servers ist die genaue — sie nennt den Stichtag
        // und die Summe. Eine eigene Meldung wäre ungenauer.
        throw new Error(result.message || t("saveError"));
      }
      invalidate(["lease-lessors", leaseId]);
      toast.success(result.saved === 0 ? t("clearedToast") : t("savedToast"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveError"), { duration: 12_000 });
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || rows === null) {
    return (
      <Card>
        <CardContent className="py-6">
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Summe ohne Berücksichtigung der Stichtage — als schnelle Rückmeldung beim
  // Tippen. Die stichtagsgenaue Prüfung macht der Server, weil sie bei einem
  // Eigentümerwechsel je Abschnitt anders ausfällt.
  const sum = rows.reduce((total, row) => total + (Number(row.sharePercent.replace(",", ".")) || 0), 0);
  const hasDates = rows.some((row) => row.validFrom || row.validTo);
  const usingFallback = data?.source === "SINGLE_LESSOR_FALLBACK";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-5 w-5" />
          {t("cardTitle")}
          <InfoTooltip text={t("cardTooltip")} />
          {usingFallback && <Badge variant="outline">{t("fallbackBadge")}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {usingFallback && (
          // Wichtig, damit niemand glaubt, hier fehle etwas: der Vertrag
          // rechnet unverändert weiter, solange nichts erfasst ist.
          <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            {t("fallbackHint", {
              lessor: data?.fallbackLessor ? personLabel(data.fallbackLessor) : t("noLessor"),
            })}
          </p>
        )}

        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.key} className="rounded-md border p-3">
                <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("person")}</Label>
                    <Combobox
                      options={personOptions}
                      value={row.personId}
                      onChange={(value) => update(row.key, { personId: value })}
                      onSearchChange={setPersonSearch}
                      loading={personsLoading}
                      placeholder={t("personPlaceholder")}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor={`share-${row.key}`}>
                      {t("sharePercent")}
                    </Label>
                    <Input
                      id={`share-${row.key}`}
                      value={row.sharePercent}
                      onChange={(e) => update(row.key, { sharePercent: e.target.value })}
                      placeholder="33,33"
                      inputMode="decimal"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("removeRow")}
                      onClick={() =>
                        setRows((current) =>
                          current ? current.filter((r) => r.key !== row.key) : current,
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor={`from-${row.key}`}>
                      {t("validFrom")}
                    </Label>
                    <Input
                      id={`from-${row.key}`}
                      type="date"
                      value={row.validFrom}
                      onChange={(e) => update(row.key, { validFrom: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor={`to-${row.key}`}>
                      {t("validTo")}
                    </Label>
                    <Input
                      id={`to-${row.key}`}
                      type="date"
                      value={row.validTo}
                      onChange={(e) => update(row.key, { validTo: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs" htmlFor={`iban-${row.key}`}>
                      {t("bankIban")}
                    </Label>
                    <Input
                      id={`iban-${row.key}`}
                      value={row.bankIban}
                      onChange={(e) => update(row.key, { bankIban: e.target.value })}
                      placeholder={t("bankIbanPlaceholder")}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setRows((current) => [
                ...(current ?? []),
                {
                  key: `new-${nextKey.current++}`,
                  personId: "",
                  sharePercent: "",
                  validFrom: "",
                  validTo: "",
                  bankIban: "",
                  notes: "",
                },
              ])
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("addRow")}
          </Button>

          {rows.length > 0 && (
            <span
              className={
                Math.abs(sum - 100) > 0.011 && !hasDates
                  ? "text-xs font-medium text-destructive"
                  : "text-xs text-muted-foreground"
              }
            >
              {t("sumLine", { sum: sum.toFixed(2).replace(".", ",") })}
              {hasDates && ` · ${t("sumWithDatesHint")}`}
            </span>
          )}

          <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {t("save")}
          </Button>
        </div>

        {data && data.problems.length > 0 && !usingFallback && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <p className="flex items-center gap-2 text-xs font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {t("problemsTitle")}
            </p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
              {data.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-xs text-muted-foreground">{t("vatHint")}</p>
      </CardContent>
    </Card>
  );
}
