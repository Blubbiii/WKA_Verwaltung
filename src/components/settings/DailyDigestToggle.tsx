"use client";

/**
 * Idee E — Daily-Digest Toggle.
 *
 * Self-contained Switch der die tägliche Übersicht-Mail an/aus schaltet.
 * Wird in der Settings-Page neben den anderen Notification-Settings gemountet.
 *
 * Polled NICHT (Settings-State ist statisch zwischen Save-Aktionen), lädt nur
 * 1× beim Mount.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

export function DailyDigestToggle() {
  const t = useTranslations("settings.dailyDigest");
  const [enabled, setEnabled] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/user/digest-preference");
        if (!res.ok) return;
        const json = (await res.json()) as { enabled: boolean; lastSentAt: string | null };
        if (!cancelled) {
          setEnabled(json.enabled);
          setLastSentAt(json.lastSentAt);
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = async (next: boolean) => {
    setSaving(true);
    setEnabled(next); // optimistic
    try {
      const res = await fetch("/api/user/digest-preference", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error("save failed");
      toast.success(next ? t("toastEnabled") : t("toastDisabled"));
    } catch {
      // rollback
      setEnabled(!next);
      toast.error(t("toastFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-full" />
        ) : (
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="daily-digest-toggle" className="flex-1 cursor-pointer">
              <span className="font-medium">{t("toggleLabel")}</span>
              {lastSentAt && (
                <span className="block text-xs text-muted-foreground mt-1">
                  {t("lastSent", {
                    date: new Date(lastSentAt).toLocaleDateString("de-DE"),
                  })}
                </span>
              )}
            </Label>
            <Switch
              id="daily-digest-toggle"
              checked={enabled}
              disabled={saving}
              onCheckedChange={handleToggle}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
