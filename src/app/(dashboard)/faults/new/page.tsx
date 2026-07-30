"use client";

/**
 * Neuer Störungsvorgang.
 *
 * A1 (Audit 2026-07). Bewusst kurz gehalten: die Bewertung, die Verknüpfungen
 * und der Anspruch entstehen auf der Detailseite. Wer eine Störung erfasst,
 * steht meist unter Zeitdruck — Anlage, Zeitraum und ein Titel reichen, alles
 * Weitere kann warten.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { useApiQuery } from "@/hooks/useApiQuery";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { PAGE_SIZE_DROPDOWN } from "@/lib/config/pagination";
import { CAUSE_CATEGORIES } from "@/lib/faults/constants";

interface TurbineOption {
  id: string;
  designation: string;
  park: { name: string; shortName: string | null } | null;
}

export default function NewFaultCasePage() {
  const t = useTranslations("faults");
  const router = useRouter();

  const [turbineId, setTurbineId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [causeCategory, setCauseCategory] = useState<string>("UNKNOWN");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: turbinesData } = useApiQuery<{ data: TurbineOption[] }>(
    ["turbines", "fault-options"],
    `/api/turbines?limit=${PAGE_SIZE_DROPDOWN}`,
  );
  const turbines = turbinesData?.data ?? [];

  useUnsavedChanges({
    when: !saved && (turbineId !== "" || title !== "" || startAt !== ""),
    message: t("new.unsavedWarning"),
  });

  // Ende vor Beginn ergibt eine negative Störungsdauer — das faengt auch der
  // Server ab, aber hier sieht man es sofort statt erst nach dem Absenden.
  const rangeInvalid = startAt !== "" && endAt !== "" && new Date(endAt) < new Date(startAt);
  const canSubmit = turbineId !== "" && title.trim() !== "" && startAt !== "" && !rangeInvalid;

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch("/api/faults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turbineId,
          title: title.trim(),
          description: description.trim() || undefined,
          startAt: new Date(startAt).toISOString(),
          endAt: endAt ? new Date(endAt).toISOString() : null,
          causeCategory,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.message || t("new.createError"));

      setSaved(true);
      toast.success(t("new.created", { caseNumber: result.caseNumber }));
      router.push(`/faults/${result.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("new.createError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/faults">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("new.title")}</h1>
          <p className="text-muted-foreground">{t("new.description")}</p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">{t("new.cardTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>
              {t("new.turbine")} <span className="text-destructive">*</span>
            </Label>
            <Combobox
              value={turbineId}
              onChange={setTurbineId}
              placeholder={t("new.turbinePlaceholder")}
              options={turbines.map((turbine) => ({
                value: turbine.id,
                label: turbine.designation,
                description: turbine.park?.shortName || turbine.park?.name || undefined,
              }))}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="faultTitle">
              {t("new.titleField")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="faultTitle"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("new.titlePlaceholder")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="startAt">
                {t("new.start")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="startAt"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="endAt">{t("new.end")}</Label>
              <Input
                id="endAt"
                type="datetime-local"
                value={endAt}
                min={startAt || undefined}
                onChange={(e) => setEndAt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t("new.endHint")}</p>
            </div>
          </div>

          {rangeInvalid && (
            <p className="text-sm text-destructive">{t("new.rangeInvalid")}</p>
          )}

          <div className="space-y-1">
            <Label>{t("new.cause")}</Label>
            <Select value={causeCategory} onValueChange={setCauseCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAUSE_CATEGORIES.map((cause) => (
                  <SelectItem key={cause} value={cause}>
                    {t(`cause.${cause}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* UNKNOWN ist der Standard und bewusst kein Mangel: die Ursache
                steht bei der Erfassung oft noch nicht fest. */}
            <p className="text-xs text-muted-foreground">{t("new.causeHint")}</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="faultDescription">{t("new.notes")}</Label>
            <Textarea
              id="faultDescription"
              value={description}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" asChild>
              <Link href="/faults">{t("new.cancel")}</Link>
            </Button>
            <Button disabled={!canSubmit || saving} onClick={() => void submit()}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("new.submit")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
