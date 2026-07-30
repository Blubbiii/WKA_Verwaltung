"use client";

/**
 * GoBD §145 AO Verfahrensdokumentation — Generator.
 *
 * TF-11 (Audit 2026-07): `/api/admin/verfahrensdokumentation` war vollständig
 * implementiert und hatte keinen UI-Aufrufer. Bei einer Betriebsprüfung ist das
 * das erste Dokument, nach dem gefragt wird.
 *
 * Der Endpunkt liefert Markdown (Content-Type text/markdown) mit den aktuellen
 * Mandantendaten und dem System-Status substituiert.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Download, Loader2, Info, Eye } from "lucide-react";
import { downloadText } from "@/lib/download";

export default function VerfahrensdokumentationContent() {
  const t = useTranslations("buchhaltung.abschlussVerfahrensdoku");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  async function load(): Promise<string | null> {
    const res = await fetch("/api/admin/verfahrensdokumentation");
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      throw new Error(json?.message ?? json?.error ?? t("error"));
    }
    return res.text();
  }

  async function handlePreview() {
    setLoading(true);
    try {
      const text = await load();
      setPreview(text);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    setLoading(true);
    try {
      // Bewusst nicht downloadFromResponse: der Endpunkt setzt
      // `Content-Disposition: inline`, ein Browser wuerde die Datei also
      // anzeigen statt speichern. Der Text wird deshalb selbst verpackt.
      const text = await load();
      if (text === null) return;
      const stamp = new Date().toISOString().slice(0, 10);
      downloadText(text, `verfahrensdokumentation-${stamp}.md`, "text/markdown;charset=utf-8");
      toast.success(t("success"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>{t("info")}</AlertDescription>
        </Alert>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handlePreview} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Eye className="mr-2 h-4 w-4" />
            )}
            {t("preview")}
          </Button>
          <Button onClick={handleDownload} disabled={loading}>
            <Download className="mr-2 h-4 w-4" />
            {t("download")}
          </Button>
        </div>

        {preview !== null && (
          <div className="rounded-md border bg-muted/30">
            <div className="border-b px-3 py-2 text-xs text-muted-foreground">
              {t("previewLabel")}
            </div>
            {/* Roher Markdown-Text — bewusst nicht gerendert, damit sichtbar
                bleibt, was tatsaechlich uebergeben wird. */}
            <pre className="max-h-[60vh] overflow-auto p-4 text-xs whitespace-pre-wrap">
              {preview}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
