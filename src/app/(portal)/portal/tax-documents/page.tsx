"use client";

/**
 * PF-2: Steuerunterlagen-Self-Service im Anleger-Portal.
 * Listet Documents der Funds des Shareholders, die als "Steuer"-Tag markiert sind.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, FileText, Receipt } from "lucide-react";
import { toast } from "sonner";
import { LOCALE_DE } from "@/lib/format";

interface TaxDoc {
  id: string;
  title: string;
  description: string | null;
  category: string;
  tags: string[];
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  fund: { id: string; name: string } | null;
  year: number;
  createdAt: string;
}

function formatBytes(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function TaxDocumentsPage() {
  const [docs, setDocs] = useState<TaxDoc[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const url =
        selectedYear === "all"
          ? "/api/portal/tax-documents"
          : `/api/portal/tax-documents?year=${selectedYear}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Fehler beim Laden");
      const json = await res.json();
      setDocs(json.data || []);
      if (json.years) setYears(json.years);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  async function download(doc: TaxDoc) {
    setDownloading(doc.id);
    try {
      const res = await fetch(`/api/portal/tax-documents/${doc.id}/download`);
      if (!res.ok) throw new Error("Download fehlgeschlagen");
      const json = await res.json();
      // open signed URL in new tab
      window.open(json.url, "_blank");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Receipt className="h-7 w-7" />
          Steuerunterlagen
        </h1>
        <p className="text-muted-foreground">
          Ihre Steuerbescheinigungen und KapESt-Bescheinigungen zum Download.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Steuerjahr:</span>
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Jahre</SelectItem>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : docs.length === 0 ? (
        <Alert>
          <AlertDescription>
            Aktuell sind keine Steuerunterlagen verfügbar.
            {selectedYear !== "all" && " Wählen Sie ein anderes Jahr oder „Alle Jahre“."}
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {docs.length} Dokument{docs.length === 1 ? "" : "e"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-4 rounded-md border p-3 hover:bg-muted/30"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.fund?.name && `${doc.fund.name} · `}
                      Jahr {doc.year} · {formatBytes(doc.fileSize)} ·{" "}
                      {new Date(doc.createdAt).toLocaleDateString(LOCALE_DE)}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => download(doc)}
                  disabled={downloading === doc.id}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
