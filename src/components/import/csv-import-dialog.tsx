"use client";

/**
 * CSV-Import für Stammdaten.
 *
 * Bedienaufwand #22 (Audit 2026-07): Kontakte und Lieferanten sind
 * exportierbar, aber nicht importierbar. Beim Onboarding heisst das abtippen.
 *
 * Drei Schritte: Datei wählen → Spalten zuordnen → prüfen und übernehmen.
 *
 * ## Warum die Prüfung auf dem Server läuft
 *
 * Der Schritt „prüfen" ruft dieselbe Route wie der Import, nur mit
 * `dryRun: true`. Eine clientseitige Vorschau könnte weder Feldlängen der
 * Datenbank noch bereits vorhandene Dubletten kennen — sie sähe grün aus und
 * der Import scheiterte danach. Das ist genau die Sorte Vorschau, die man
 * besser nicht hat.
 */

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Stepper, StepContent, StepActions } from "@/components/ui/stepper";
import { Combobox } from "@/components/ui/combobox";
import { parseCsv, autoDetectMapping } from "@/lib/csv";
import { IMPORT_SPECS, aliasMap, type CsvImportSpec } from "@/lib/import/csv-import-spec";
import { UPLOAD_LIMITS } from "@/lib/config/upload-limits";

interface RowProblem {
  row: number;
  field?: string;
  message: string;
}

interface CheckResult {
  total: number;
  importable?: number;
  imported?: number;
  skipped: number;
  failed: number;
  problems: RowProblem[];
  duplicates: RowProblem[];
}

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Schlüssel aus IMPORT_SPECS, z. B. "persons" oder "vendors". */
  target: keyof typeof IMPORT_SPECS;
  /** Wird nach einem Import mit mindestens einem übernommenen Datensatz gerufen. */
  onImported: () => void;
}

/** Wie viele Zeilen die Vorschau zeigt. Mehr hilft beim Prüfen nicht. */
const PREVIEW_ROWS = 5;

/** Kein Spaltenbezug — Radix-Select erlaubt keinen leeren Wert. */
const UNMAPPED = "__none__";

export function CsvImportDialog({ open, onOpenChange, target, onImported }: CsvImportDialogProps) {
  const t = useTranslations("csvImport");
  const spec: CsvImportSpec = IMPORT_SPECS[target];

  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStep(0);
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setResult(null);
  }

  async function handleFile(file: File) {
    if (file.size > UPLOAD_LIMITS.csvImport) {
      toast.error(t("errors.tooLarge"));
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.rows.length === 0) {
        toast.error(t("errors.noRows"));
        return;
      }
      setFileName(file.name);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      // Vorschlag, keine Festlegung — die Zuordnung bleibt änderbar.
      setMapping(autoDetectMapping(parsed.headers, aliasMap(spec)));
      setStep(1);
    } catch {
      toast.error(t("errors.unreadable"));
    }
  }

  /** Zeilen so umbauen, wie die Route sie erwartet: Zielfeld → Wert. */
  const mappedRows = useMemo(
    () =>
      rows.map((row) => {
        const mapped: Record<string, string> = {};
        for (const field of spec.fields) {
          const column = mapping[field.key];
          if (column && column !== UNMAPPED) mapped[field.key] = row[column] ?? "";
        }
        return mapped;
      }),
    [rows, mapping, spec],
  );

  async function send(dryRun: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/import/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: spec.target, dryRun, rows: mappedRows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || t("errors.failed"));

      setResult(data);
      if (dryRun) {
        setStep(2);
        return;
      }

      // Teilerfolg als Teilerfolg melden — nicht als Erfolg.
      if (data.imported > 0 && data.failed === 0) {
        toast.success(t("result.success", { count: data.imported }));
      } else if (data.imported > 0) {
        toast.warning(t("result.partial", { imported: data.imported, failed: data.failed }));
      } else {
        toast.error(t("result.nothing"));
      }
      if (data.imported > 0) onImported();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errors.failed"));
    } finally {
      setBusy(false);
    }
  }

  const requiredMissing = spec.fields
    .filter((field) => field.required)
    .filter((field) => !mapping[field.key] || mapping[field.key] === UNMAPPED);

  const columnOptions = [
    { value: UNMAPPED, label: t("mapping.unmapped") },
    ...headers.map((header) => ({ value: header, label: header })),
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t(`title.${spec.target}`)}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <Stepper
          steps={[
            { id: "file", title: t("steps.file") },
            { id: "mapping", title: t("steps.mapping") },
            { id: "check", title: t("steps.check") },
          ]}
          currentStep={step}
        />

        <StepContent>
          {step === 0 && (
            <div className="space-y-3">
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Zuruecksetzen, damit dieselbe Datei erneut gewaehlt werden
                  // kann — sonst feuert change beim zweiten Mal nicht.
                  e.target.value = "";
                  if (file) void handleFile(file);
                }}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-sm text-muted-foreground hover:bg-muted/50"
              >
                <FileUp className="h-8 w-8" aria-hidden />
                {t("file.pick")}
              </button>
              <p className="text-xs text-muted-foreground">{t("file.hint")}</p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("mapping.summary", { file: fileName, rows: rows.length })}
              </p>

              <div className="grid max-h-80 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                {spec.fields.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <Label className="text-xs">
                      {t(`fields.${field.labelKey}`)}
                      {field.required && <span className="ml-1 text-destructive">*</span>}
                    </Label>
                    <Combobox
                      value={mapping[field.key] ?? UNMAPPED}
                      onChange={(value) =>
                        setMapping((prev) => ({ ...prev, [field.key]: value }))
                      }
                      options={columnOptions}
                      placeholder={t("mapping.unmapped")}
                    />
                  </div>
                ))}
              </div>

              {requiredMissing.length > 0 && (
                <p className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                  {t("mapping.missingRequired", {
                    fields: requiredMissing.map((f) => t(`fields.${f.labelKey}`)).join(", "),
                  })}
                </p>
              )}
            </div>
          )}

          {step === 2 && result && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Figure label={t("result.importable")} value={result.importable ?? result.imported ?? 0} />
                <Figure label={t("result.skipped")} value={result.skipped} />
                <Figure label={t("result.failed")} value={result.failed} highlight={result.failed > 0} />
              </div>

              {result.problems.length > 0 && (
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t("result.problemsTitle")}</p>
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded border p-2 text-xs">
                    {result.problems.slice(0, 50).map((problem, i) => (
                      <p key={i}>
                        <Badge variant="outline" className="mr-2">
                          {t("result.row", { row: problem.row })}
                        </Badge>
                        {problem.message}
                      </p>
                    ))}
                    {result.problems.length > 50 && (
                      <p className="text-muted-foreground">
                        {t("result.moreProblems", { count: result.problems.length - 50 })}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {result.duplicates.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("result.duplicatesHint", { count: result.duplicates.length })}
                </p>
              )}

              {result.imported !== undefined && (
                <p className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden />
                  {t("result.done", { count: result.imported })}
                </p>
              )}
            </div>
          )}
        </StepContent>

        <StepActions>
          <div className="flex w-full justify-between gap-2">
            <Button
              variant="outline"
              disabled={step === 0 || busy}
              onClick={() => setStep((s) => s - 1)}
            >
              {t("actions.back")}
            </Button>

            <div className="flex gap-2">
              {step === 1 && (
                <Button disabled={requiredMissing.length > 0 || busy} onClick={() => void send(true)}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("actions.check")}
                </Button>
              )}
              {step === 2 && result?.imported === undefined && (
                <Button
                  disabled={busy || (result?.importable ?? 0) === 0}
                  onClick={() => void send(false)}
                >
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {t("actions.import", { count: result?.importable ?? 0 })}
                </Button>
              )}
              {step === 2 && result?.imported !== undefined && (
                <Button onClick={() => onOpenChange(false)}>{t("actions.close")}</Button>
              )}
            </div>
          </div>
        </StepActions>
      </DialogContent>
    </Dialog>
  );
}

function Figure({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${highlight ? "text-destructive" : ""}`}>
        {value}
      </p>
    </div>
  );
}

/** Zeigt die ersten Zeilen — nur beim Zuordnen hilfreich, deshalb hier lokal. */
export const CSV_PREVIEW_ROWS = PREVIEW_ROWS;
