"use client";

/**
 * Zählpunkte eines Parks.
 *
 * A3 (Audit 2026-07): „Zählpunkt / Marktlokations-ID kommen im ganzen Codebase
 * nicht vor." Ohne diese Kennungen lässt sich eine Netzbetreiber-Abrechnung
 * nicht zuordnen — sie sind Stammdaten und gehören an den Park.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Gauge, Loader2, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApiQuery, useInvalidateQuery } from "@/hooks/useApiQuery";

interface MeteringPoint {
  id: string;
  kind: "MARKTLOKATION" | "MESSLOKATION";
  direction: "FEED_IN" | "CONSUMPTION";
  code: string;
  gridOperator: string | null;
  balancingGroup: string | null;
  isActive: boolean;
  turbine: { id: string; designation: string } | null;
}

export function MeteringPointsCard({ parkId }: { parkId: string }) {
  const t = useTranslations("meteringPoints");
  const invalidate = useInvalidateQuery();

  const { data, isLoading } = useApiQuery<{ data: MeteringPoint[] }>(
    ["metering-points", parkId],
    `/api/energy/metering-points?parkId=${parkId}`,
  );
  const points = data?.data ?? [];

  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<"MARKTLOKATION" | "MESSLOKATION">("MARKTLOKATION");
  const [code, setCode] = useState("");
  const [gridOperator, setGridOperator] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch("/api/energy/metering-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          code: code.trim(),
          parkId,
          gridOperator: gridOperator.trim() || undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        // Die Formprüfung des Servers steht in details — sie ist die
        // hilfreichere Meldung als ein allgemeines "ungültige Eingabe".
        const detail = result.details?.[0]?.message;
        throw new Error(detail || result.message || t("saveError"));
      }
      invalidate(["metering-points", parkId]);
      toast.success(t("saved"));
      setCode("");
      setGridOperator("");
      setAdding(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Gauge className="h-4 w-4" />
          {t("title")}
          <InfoTooltip text={t("tooltip")} />
        </CardTitle>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("add")}
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : points.length === 0 && !adding ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="space-y-2">
            {points.map((point) => (
              <div
                key={point.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm">{point.code}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(`kinds.${point.kind}`)} · {t(`directions.${point.direction}`)}
                    {point.turbine && ` · ${point.turbine.designation}`}
                    {point.gridOperator && ` · ${point.gridOperator}`}
                  </p>
                </div>
                {!point.isActive && <Badge variant="outline">{t("inactive")}</Badge>}
              </div>
            ))}
          </div>
        )}

        {adding && (
          <div className="space-y-3 rounded-md border border-dashed p-3">
            <div className="space-y-1">
              <Label className="text-xs">{t("kind")}</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MARKTLOKATION">{t("kinds.MARKTLOKATION")}</SelectItem>
                  <SelectItem value="MESSLOKATION">{t("kinds.MESSLOKATION")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs" htmlFor="mpCode">
                {t("code")}
              </Label>
              <Input
                id="mpCode"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={kind === "MARKTLOKATION" ? "12345678901" : "DE0001234567890000000000000012345"}
                className="font-mono"
              />
              {/* Die erwartete Form direkt am Feld: die Serverprüfung weist
                  sonst erst nach dem Absenden zurück. */}
              <p className="text-xs text-muted-foreground">{t(`hints.${kind}`)}</p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs" htmlFor="mpOperator">
                {t("gridOperator")}
              </Label>
              <Input
                id="mpOperator"
                value={gridOperator}
                onChange={(e) => setGridOperator(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAdding(false);
                  setCode("");
                }}
              >
                {t("cancel")}
              </Button>
              <Button size="sm" disabled={code.trim() === "" || saving} onClick={() => void submit()}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("save")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
