"use client";

import { useState, useCallback, useRef } from "react";
import {
  Upload,
  FileText,
  X,
  Download,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { useFileUpload } from "@/hooks/useFileUpload";
import { cn } from "@/lib/utils";

interface ProxyDocumentUploadProps {
  proxyId: string;
  hasDocument: boolean;
  onUploadSuccess?: () => void;
  onDeleteSuccess?: () => void;
  className?: string;
  /** Kompakte Ansicht für Tabellen-Integration */
  compact?: boolean;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function ProxyDocumentUpload({
  proxyId,
  hasDocument,
  onUploadSuccess,
  onDeleteSuccess,
  className,
  compact = false,
}: ProxyDocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    upload: uploadWithProgress,
    isUploading,
    progress: uploadProgress,
  } = useFileUpload();

  // Validierung der Datei
  const validateFile = (file: File): string | null => {
    if (file.type !== "application/pdf") {
      return "Nur PDF-Dateien sind erlaubt";
    }
    if (file.size > MAX_FILE_SIZE) {
      return "Die Datei darf maximal 10MB gross sein";
    }
    return null;
  };

  // Upload Handler
  const handleUpload = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      toast({
        title: "Fehler",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Use XMLHttpRequest-based upload for real progress tracking
      await uploadWithProgress(`/api/proxies/${proxyId}/document`, formData);

      toast({
        title: "Erfolgreich",
        description: "Dokument wurde hochgeladen",
      });

      onUploadSuccess?.();
    } catch (error) {
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : "Fehler beim Hochladen",
        variant: "destructive",
      });
    }
  };

  // Download Handler
  const handleDownload = async () => {
    setIsDownloading(true);

    try {
      const response = await fetch(`/api/proxies/${proxyId}/document`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Fehler beim Abrufen");
      }

      const data = await response.json();

      // Oeffne die signierte URL in neuem Tab
      window.open(data.url, "_blank");
    } catch (error) {
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : "Fehler beim Download",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  // Delete Handler
  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/proxies/${proxyId}/document`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Fehler beim Löschen");
      }

      toast({
        title: "Erfolgreich",
        description: "Dokument wurde gelöscht",
      });

      onDeleteSuccess?.();
    } catch (error) {
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : "Fehler beim Löschen",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Drag & Drop Handler
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleUpload(files[0]);
    }
  }, [proxyId]);

  // File Input Handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleUpload(files[0]);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Kompakte Ansicht für Tabellen
  if (compact) {
    if (hasDocument) {
      return (
        <div className={cn("flex items-center gap-2", className)}>
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            <CheckCircle className="mr-1 h-3 w-3" />
            Dokument
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleDownload}
            disabled={isDownloading}
            title="Dokument herunterladen"
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </Button>
        </div>
      );
    }

    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Badge variant="outline" className="text-muted-foreground">
          <AlertCircle className="mr-1 h-3 w-3" />
          Fehlt
        </Badge>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileSelect}
          disabled={isUploading}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          title="Dokument hochladen"
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
        </Button>
      </div>
    );
  }

  // Volle Ansicht
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg">Vollmachts-Dokument</CardTitle>
        <CardDescription>
          Laden Sie die unterschriebene Vollmacht als PDF hoch (max. 10MB)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasDocument ? (
          // Dokument vorhanden - Zeige Preview und Aktionen
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <FileText className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="font-medium">Vollmacht.pdf</p>
                  <p className="text-sm text-muted-foreground">
                    Dokument hochgeladen
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                <CheckCircle className="mr-1 h-3 w-3" />
                Vorhanden
              </Badge>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleDownload}
                disabled={isDownloading}
                className="flex-1"
              >
                {isDownloading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Herunterladen
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Löschen
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Dokument löschen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Möchten Sie das Vollmachts-Dokument wirklich löschen?
                      Diese Aktion kann nicht rueckgaengig gemacht werden.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Löschen
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* Erneut hochladen */}
            <div className="pt-2 border-t">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileSelect}
                disabled={isUploading}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="text-muted-foreground"
              >
                <Upload className="mr-2 h-4 w-4" />
                Neues Dokument hochladen
              </Button>
            </div>
          </div>
        ) : (
          // Kein Dokument - Zeige Upload Zone
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileSelect}
              disabled={isUploading}
            />

            {isUploading ? (
              // Upload in Progress
              <div className="p-6 border-2 border-dashed rounded-lg space-y-4">
                <div className="flex items-center justify-center">
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                </div>
                <div className="space-y-2">
                  <Progress value={uploadProgress} />
                  <p className="text-sm text-center text-muted-foreground">
                    Dokument wird hochgeladen... {uploadProgress}%
                  </p>
                </div>
              </div>
            ) : (
              // Drag & Drop Zone
              <div
                className={cn(
                  "p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors",
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-primary/50"
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="p-3 bg-muted rounded-full">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">
                      PDF hier ablegen oder klicken zum Auswaehlen
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Maximal 10MB, nur PDF-Dateien
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              <span>Kein Dokument hochgeladen</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
