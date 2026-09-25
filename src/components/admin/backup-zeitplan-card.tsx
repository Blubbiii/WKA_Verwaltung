"use client";

/**
 * Backup schedule and state (decision E3). The schedule is stored in the
 * database; the wpm-backup container reads it every 5 minutes and reports
 * back. The state block tells the three failure modes apart, because each
 * needs a different action: service not running, last run failed, overdue.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Settings } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";
import type { BackupStatus, BackupWarnung, BackupZeitplan } from "@/lib/backup-zeitplan";

interface BackupZeitplanCardProps {
  zeitplan: BackupZeitplan;
  status: BackupStatus;
  naechsterLauf: string | null;
  lage: { ok: boolean; warnung: BackupWarnung | null };
  onGespeichert: () => void;
}

function groesse(bytes?: number) {
  if (!bytes) return "–";
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1).replace(".", ",")} GB` : `${mb.toFixed(1).replace(".", ",")} MB`;
}

const zeit = (iso?: string | null) => (iso ? formatDateTime(new Date(iso)) : "–");

export function BackupZeitplanCard({ zeitplan, status, naechsterLauf, lage, onGespeichert }: BackupZeitplanCardProps) {
  const t = useTranslations("admin.backupSchedule");
  const [plan, setPlan] = useState<BackupZeitplan>(zeitplan);
  const setze = <K extends keyof BackupZeitplan>(feld: K, wert: BackupZeitplan[K]) =>
    setPlan((alt) => ({ ...alt, [feld]: wert }));

  const speichern = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateSchedule", zeitplan: plan }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || t("saveError"));
      return json;
    },
    onSuccess: () => {
      toast.success(t("saved"));
      onGespeichert();
    },
    onError: (e) => toast.error(e.message),
  });

  const anzahlFeld = (feld: "behalteTaeglich" | "behalteWoechentlich" | "behalteMonatlich", id: string) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{t(`fields.${feld}`)}</Label>
      <Input
        id={id}
        type="number"
        min={1}
        max={365}
        value={plan[feld]}
        disabled={!plan.aktiv}
        onChange={(e) => setze(feld, Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
      />
    </div>
  );

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {lage.warnung && lage.warnung !== "aus" ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {lage.warnung === "keinLebenszeichen" && t("warnNoHeartbeat", { zeit: zeit(status.lebenszeichen) })}
              {lage.warnung === "fehlgeschlagen" &&
                t("warnFailed", { zeit: zeit(status.letzterFehler), fehler: status.fehlertext || "–" })}
              {lage.warnung === "ueberfaellig" && t("warnOverdue", { zeit: zeit(status.letzterErfolg) })}
            </AlertDescription>
          </Alert>
        ) : lage.ok ? (
          <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4" />
            {t("allGood")}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t("off")}</p>
        )}

        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">{t("lastBackup")}</dt>
            <dd className="font-medium">
              {zeit(status.letzterErfolg)}
              {status.letzterTyp && (
                <span className="text-muted-foreground">
                  {" "}
                  · {t(`types.${status.letzterTyp}`)} · {groesse(status.letzteGroesse)}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("nextBackup")}</dt>
            <dd className="font-medium">{naechsterLauf ? zeit(naechsterLauf) : t("none")}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("heartbeat")}</dt>
            <dd className="font-medium">{zeit(status.lebenszeichen)}</dd>
          </div>
        </dl>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="bz-aktiv">{t("fields.aktiv")}</Label>
              <p className="text-sm text-muted-foreground">{t("fields.aktivHint")}</p>
            </div>
            <Switch id="bz-aktiv" checked={plan.aktiv} onCheckedChange={(v) => setze("aktiv", v)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="bz-s3">{t("fields.s3")}</Label>
              <p className="text-sm text-muted-foreground">{t("fields.s3Hint")}</p>
            </div>
            <Switch id="bz-s3" checked={plan.s3} disabled={!plan.aktiv} onCheckedChange={(v) => setze("s3", v)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bz-rhythmus">{t("fields.rhythmus")}</Label>
            <Select
              value={plan.rhythmus}
              onValueChange={(v) => setze("rhythmus", v as BackupZeitplan["rhythmus"])}
              disabled={!plan.aktiv}
            >
              <SelectTrigger id="bz-rhythmus">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["daily", "weekly", "monthly"] as const).map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`rhythms.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bz-zeit">{t("fields.uhrzeit")}</Label>
            <Input
              id="bz-zeit"
              type="time"
              value={plan.uhrzeit}
              disabled={!plan.aktiv}
              onChange={(e) => setze("uhrzeit", e.target.value)}
            />
          </div>
          {anzahlFeld("behalteTaeglich", "bz-taeglich")}
          {anzahlFeld("behalteWoechentlich", "bz-woechentlich")}
          {anzahlFeld("behalteMonatlich", "bz-monatlich")}
        </div>
        <p className="text-xs text-muted-foreground">{t("rotationHint")}</p>

        <div className="flex justify-end">
          <Button onClick={() => speichern.mutate()} disabled={speichern.isPending || !plan.uhrzeit}>
            {speichern.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
