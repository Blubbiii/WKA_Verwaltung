"use client";

/**
 * Showcase video of the landing page: upload (POST /api/admin/marketing-video)
 * and remove (DELETE). The upload stores the file's storage key in the
 * marketing settings; the landing page plays it via /api/marketing/video.
 *
 * `onGeaendert` hands the new value back to the settings form — otherwise
 * saving the form afterwards would write the old value back.
 */

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Film, Loader2, Trash2, Upload } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/use-confirm";

interface MarketingVideoCardProps {
  videoUrl: string | undefined;
  onGeaendert: (videoUrl: string) => void;
}

export function MarketingVideoCard({ videoUrl, onGeaendert }: MarketingVideoCardProps) {
  const t = useTranslations("admin.marketingVideo");
  const feld = useRef<HTMLInputElement>(null);
  const { confirm, confirmDialog } = useConfirm();

  const hochladen = useMutation({
    mutationFn: async (datei: File) => {
      const form = new FormData();
      form.append("file", datei);
      const res = await fetch("/api/admin/marketing-video", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || t("uploadError"));
      return json as { key: string; size: number };
    },
    onSuccess: (r) => {
      onGeaendert(r.key);
      toast.success(t("uploaded"));
    },
    onError: (e) => toast.error(e.message),
  });

  const entfernen = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/marketing-video", { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || t("deleteError"));
    },
    onSuccess: () => {
      onGeaendert("");
      toast.success(t("deleted"));
    },
    onError: (e) => toast.error(e.message),
  });

  const hochgeladen = !!videoUrl && !/^https?:\/\//i.test(videoUrl);
  const beschaeftigt = hochladen.isPending || entfernen.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Film className="h-5 w-5" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">
          {hochgeladen ? t("stateUploaded") : videoUrl ? t("stateExternal", { url: videoUrl }) : t("stateNone")}
        </p>
        {hochgeladen && (
          // Plays through the public route, exactly as visitors will see it.
          <video
            controls
            preload="metadata"
            className="max-h-64 w-full rounded-md border bg-black"
            src={`/api/marketing/video?v=${encodeURIComponent(videoUrl.split("/").pop() ?? "")}`}
          />
        )}
        <input
          ref={feld}
          type="file"
          accept="video/mp4,video/webm"
          className="hidden"
          onChange={(e) => {
            const datei = e.target.files?.[0];
            if (datei) hochladen.mutate(datei);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => feld.current?.click()} disabled={beschaeftigt}>
            {hochladen.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {hochgeladen ? t("replace") : t("upload")}
          </Button>
          {hochgeladen && (
            <Button
              variant="outline"
              disabled={beschaeftigt}
              onClick={async () => {
                if (await confirm({ title: t("deleteTitle"), description: t("deleteText"), variant: "destructive" })) {
                  entfernen.mutate();
                }
              }}
            >
              {entfernen.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {t("delete")}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </CardContent>
      {confirmDialog}
    </Card>
  );
}
