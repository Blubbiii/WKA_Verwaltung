"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Upload, File, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface DocumentInfo {
  id: string;
  title: string;
  fileName: string;
  version: number;
  category: string;
}

export default function UploadNewVersionPage() {
  const params = useParams();
  const router = useRouter();
  const [document, setDocument] = useState<DocumentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [changeNotes, setChangeNotes] = useState("");

  useEffect(() => {
    async function fetchDocument() {
      try {
        const response = await fetch(`/api/documents/${params.id}`);
        if (!response.ok) throw new Error("Fehler beim Laden");
        const data = await response.json();
        setDocument(data);
      } catch {
      } finally {
        setLoading(false);
      }
    }
    fetchDocument();
  }, [params.id]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  }

  function removeFile() {
    setSelectedFile(null);
  }

  async function handleUpload() {
    if (!selectedFile || !document) return;

    try {
      setIsUploading(true);

      // In a real app, you would upload the file to a storage service first
      const fileUrl = `/uploads/${Date.now()}-${selectedFile.name}`;

      const payload = {
        title: document.title,
        category: document.category,
        fileName: selectedFile.name,
        fileUrl: fileUrl,
        fileSizeBytes: selectedFile.size,
        mimeType: selectedFile.type || "application/octet-stream",
        parentId: document.id,
        description: changeNotes || undefined,
      };

      const response = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Hochladen");
      }

      const newDoc = await response.json();
      router.push(`/documents/${newDoc.id}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Hochladen");
    } finally {
      setIsUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/documents">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück
          </Link>
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Dokument nicht gefunden.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/documents/${document.id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Neue Version hochladen</h1>
          <p className="text-muted-foreground">
            Laden Sie eine neue Version des Dokuments hoch
          </p>
        </div>
      </div>

      {/* Current Document Info */}
      <Card>
        <CardHeader>
          <CardTitle>Aktuelles Dokument</CardTitle>
          <CardDescription>
            Sie erstellen eine neue Version dieses Dokuments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-muted rounded-lg">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">{document.title}</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{document.fileName}</span>
                <Badge variant="secondary">v{document.version}</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* File Upload */}
      <Card>
        <CardHeader>
          <CardTitle>Neue Datei</CardTitle>
          <CardDescription>
            Die neue Version wird als v{document.version + 1} gespeichert
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedFile ? (
            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <File className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={removeFile}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted/70 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="mb-2 text-sm text-muted-foreground">
                  <span className="font-semibold">Klicken zum Hochladen</span>{" "}
                  oder Drag & Drop
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF, DOCX, XLSX, Bilder (max. 50MB)
                </p>
              </div>
              <input
                type="file"
                className="hidden"
                onChange={handleFileChange}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              />
            </label>
          )}

          <div>
            <label className="text-sm font-medium">Änderungsnotiz (optional)</label>
            <Textarea
              placeholder="Beschreiben Sie kurz, was sich in dieser Version geändert hat..."
              value={changeNotes}
              onChange={(e) => setChangeNotes(e.target.value)}
              rows={3}
              className="mt-2"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button
          variant="outline"
          onClick={() => router.back()}
          disabled={isUploading}
        >
          Abbrechen
        </Button>
        <Button
          onClick={handleUpload}
          disabled={isUploading || !selectedFile}
        >
          {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Version hochladen
        </Button>
      </div>
    </div>
  );
}
