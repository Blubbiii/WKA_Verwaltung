"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { FolderNode } from "@/types/document-explorer";

interface TaxExportDialogProps {
  parks: FolderNode[];
}

export function TaxExportDialog({ parks }: TaxExportDialogProps) {
  const tToast = useTranslations("documents.toasts");
  const [open, setOpen] = useState(false);
  const [parkId, setParkId] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [exporting, setExporting] = useState(false);

  // Collect all available years from parks
  const allYears = [...new Set(
    parks.flatMap((p) => p.years.map((y) => y.year))
  )].sort((a, b) => b - a);

  const handleExport = async () => {
    if (!parkId) {
      toast.error(tToast("parkRequired"));
      return;
    }

    setExporting(true);
    try {
      const res = await fetch("/api/documents/explorer/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taxExport: { parkId, year: parseInt(year) },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || tToast("exportFailed"));
      }

      // Download the ZIP
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Steuerexport-${year}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success(tToast("taxExportDownloaded"));
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tToast("exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Steuerberater-Export
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Steuerberater-Export</DialogTitle>
          <DialogDescription>
            Alle Dokumente und Rechnungen eines Parks für ein Jahr als ZIP herunterladen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Park</label>
            <Select value={parkId} onValueChange={setParkId}>
              <SelectTrigger>
                <SelectValue placeholder="Park auswählen" />
              </SelectTrigger>
              <SelectContent>
                {parks.map((p) => (
                  <SelectItem key={p.parkId ?? "null"} value={p.parkId ?? ""}>
                    {p.parkName} ({p.documentCount} Dokumente)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Jahr</label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allYears.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
                {allYears.length === 0 && (
                  <SelectItem value={String(new Date().getFullYear())} disabled>
                    Keine Daten vorhanden
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleExport} disabled={exporting || !parkId}>
            {exporting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Export starten
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
