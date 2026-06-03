"use client";

/**
 * P24.2 UI: Belegablage-Komponente für JournalEntry.
 *
 * Liste vorhandener Belege + Upload + Download mit SHA-256-Anzeige.
 */

import { useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Upload,
} from "lucide-react";

interface Attachment {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  fileHash: string;
  fileSizeBytes: string;
  description: string | null;
  uploadedAt: string;
  uploadedBy: { firstName: string | null; lastName: string | null; email: string };
}

export interface JournalAttachmentsListProps {
  journalEntryId: string;
  /** Bei POSTED-Status nur Read-Only. */
  readOnly?: boolean;
}

function fmtSize(bytes: string | number): string {
  const n = typeof bytes === "string" ? Number(bytes) : bytes;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function userName(u: Attachment["uploadedBy"]): string {
  return [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
}

export function JournalAttachmentsList({
  journalEntryId,
  readOnly = false,
}: JournalAttachmentsListProps) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [description, setDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/journal-entries/${journalEntryId}/attachments`,
      );
      if (!res.ok) throw new Error("Fehler");
      const json = await res.json();
      setItems(json.data ?? []);
    } catch {
      toast.error("Belege konnten nicht geladen werden");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journalEntryId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (description) fd.append("description", description);

      const res = await fetch(
        `/api/journal-entries/${journalEntryId}/attachments`,
        {
          method: "POST",
          body: fd,
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Upload fehlgeschlagen");
      }
      toast.success("Beleg hochgeladen");
      setDescription("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload fehlgeschlagen");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="h-5 w-5" />
          Belege
        </CardTitle>
        <CardDescription>
          GoBD §147 AO — Original-Belege mit SHA-256-Hash unveränderlich gespeichert
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            Noch keine Belege angehängt.
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((a) => (
              <li key={a.id} className="py-3 flex items-start gap-3">
                {a.mimeType.startsWith("image/") ? (
                  <ImageIcon className="h-5 w-5 mt-1 text-muted-foreground" />
                ) : (
                  <FileText className="h-5 w-5 mt-1 text-muted-foreground" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{a.fileName}</div>
                  {a.description && (
                    <div className="text-sm text-muted-foreground truncate">
                      {a.description}
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                    <span>{fmtSize(a.fileSizeBytes)}</span>
                    <span>•</span>
                    <span>{fmtDate(a.uploadedAt)}</span>
                    <span>•</span>
                    <span>{userName(a.uploadedBy)}</span>
                  </div>
                  <div className="text-xs font-mono text-muted-foreground/70 mt-1 truncate" title={a.fileHash}>
                    SHA-256: {a.fileHash.slice(0, 16)}…
                  </div>
                </div>
                <a
                  href={a.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm"
                >
                  <Button variant="outline" size="sm">
                    Öffnen
                  </Button>
                </a>
              </li>
            ))}
          </ul>
        )}

        {!readOnly && (
          <div className="rounded-lg border border-dashed p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Upload className="h-4 w-4" />
              Beleg hinzufügen
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Beschreibung (optional)</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder='z.B. "Eingangsrechnung Müller GmbH"'
                disabled={isUploading}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Datei (PDF / JPG / PNG / TIFF, max. 25 MB)</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/tiff,image/webp"
                onChange={handleUpload}
                disabled={isUploading}
              />
            </div>
            {isUploading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Lädt hoch …
              </div>
            )}
          </div>
        )}

        {readOnly && (
          <Badge variant="outline" className="text-xs">
            Read-Only (POSTED — keine neuen Belege)
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
