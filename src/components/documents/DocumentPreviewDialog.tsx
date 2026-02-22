"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useState, useEffect, Suspense } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Download,
  Loader2,
  FileText,
  FileSpreadsheet,
  FileImage,
  ExternalLink,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Dynamically import the PDF viewer component to avoid SSR issues
const PDFViewerContent = dynamic(
  () => import("./DocumentPreviewDialogPDF").then((mod) => mod.DocumentPreviewDialogPDF),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">PDF wird geladen...</p>
      </div>
    ),
  }
);

interface DocumentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: {
    id: string;
    title: string;
    fileName: string;
    fileUrl: string;
    mimeType?: string | null;
  } | null;
}

export function DocumentPreviewDialog({
  open,
  onOpenChange,
  document,
}: DocumentPreviewDialogProps) {
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const [urlLoading, setUrlLoading] = useState(false);

  // Set content URL when document changes
  // Use proxy route to avoid CORS issues with S3/MinIO
  useEffect(() => {
    if (document && open) {
      setPageNumber(1);
      setScale(1.0);
      setRotation(0);
      setLoading(true);
      setError(null);
      setPresignedUrl(null);
      setUrlLoading(true);

      // Check if fileUrl is already a full URL (legacy) or an S3 key
      if (document.fileUrl.startsWith("http://") || document.fileUrl.startsWith("https://")) {
        // Legacy URL - use directly
        setPresignedUrl(document.fileUrl);
        setUrlLoading(false);
      } else {
        // S3 key - use proxy route (avoids CORS issues)
        // The proxy route streams the file through our server with proper headers
        setPresignedUrl(`/api/documents/${document.id}/content`);
        setUrlLoading(false);
      }
    }
  }, [document?.id, open]);

  if (!document) return null;

  const fileType = getFileType(document.mimeType, document.fileName);

  function getFileType(
    mimeType: string | null | undefined,
    fileName: string
  ): "pdf" | "image" | "office" | "unknown" {
    const mime = mimeType?.toLowerCase() || "";
    const ext = fileName.split(".").pop()?.toLowerCase() || "";

    if (mime === "application/pdf" || ext === "pdf") return "pdf";
    if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext))
      return "image";
    if (
      mime.includes("word") ||
      mime.includes("spreadsheet") ||
      mime.includes("excel") ||
      mime.includes("presentation") ||
      mime.includes("powerpoint") ||
      ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp"].includes(ext)
    )
      return "office";
    return "unknown";
  }

  function handleDownload() {
    if (!document) return;
    if (presignedUrl) {
      window.open(presignedUrl, "_blank");
    } else {
      // Fallback: redirect to download endpoint
      window.location.href = `/api/documents/${document.id}/download?redirect=true`;
    }
  }

  function toggleFullscreen() {
    setIsFullscreen(!isFullscreen);
  }

  function goToPrevPage() {
    setPageNumber((prev) => Math.max(prev - 1, 1));
  }

  function goToNextPage() {
    setPageNumber((prev) => Math.min(prev + 1, numPages || 1));
  }

  function zoomIn() {
    setScale((prev) => Math.min(prev + 0.25, 3));
  }

  function zoomOut() {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  }

  function rotate() {
    setRotation((prev) => (prev + 90) % 360);
  }

  function getOfficeViewerUrl(fileUrl: string): string {
    const encodedUrl = encodeURIComponent(fileUrl);
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodedUrl}`;
  }

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  }

  function onDocumentLoadError(_err: Error) {
    setLoading(false);
    setError("PDF konnte nicht geladen werden");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex flex-col",
          isFullscreen
            ? "max-w-[100vw] max-h-[100vh] w-screen h-screen rounded-none"
            : "max-w-5xl max-h-[90vh]"
        )}
      >
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="truncate flex-1">{document.title}</DialogTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={toggleFullscreen} title="Vollbild">
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
              <Button variant="ghost" size="icon" onClick={handleDownload} title="Herunterladen">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Content Area */}
        <div className="flex-1 min-h-0 overflow-auto bg-muted/30 rounded-lg">
          {urlLoading && (
            <div className="flex flex-col items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">URL wird abgerufen...</p>
            </div>
          )}

          {!urlLoading && presignedUrl && fileType === "pdf" && (
            <Suspense
              fallback={
                <div className="flex flex-col items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">PDF wird geladen...</p>
                </div>
              }
            >
              <PDFViewerContent
                fileUrl={presignedUrl}
                pageNumber={pageNumber}
                numPages={numPages}
                scale={scale}
                rotation={rotation}
                loading={loading}
                error={error}
                onDocumentLoadSuccess={onDocumentLoadSuccess}
                onDocumentLoadError={onDocumentLoadError}
                goToPrevPage={goToPrevPage}
                goToNextPage={goToNextPage}
                zoomIn={zoomIn}
                zoomOut={zoomOut}
                rotate={rotate}
                handleDownload={handleDownload}
              />
            </Suspense>
          )}

          {!urlLoading && presignedUrl && fileType === "image" && (
            <div className="flex items-center justify-center p-4 min-h-[400px]">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
              <Image
                src={presignedUrl}
                alt={document.title}
                width={800}
                height={600}
                className="max-w-full max-h-[70vh] object-contain rounded shadow-lg"
                onLoad={() => setLoading(false)}
                onError={() => {
                  setLoading(false);
                  setError("Bild konnte nicht geladen werden");
                }}
                style={{ display: loading ? "none" : "block", width: "auto", height: "auto" }}
                unoptimized
              />
              {error && (
                <div className="flex flex-col items-center justify-center text-center">
                  <FileImage className="h-16 w-16 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">{error}</p>
                  <Button variant="outline" className="mt-4" onClick={handleDownload}>
                    <Download className="mr-2 h-4 w-4" />
                    Bild herunterladen
                  </Button>
                </div>
              )}
            </div>
          )}

          {!urlLoading && presignedUrl && fileType === "office" && (
            <div className="flex flex-col h-full min-h-[500px]">
              <div className="flex items-center justify-center gap-2 p-2 border-b bg-background">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Office-Dokument: {document.fileName}
                </span>
                <Button variant="outline" size="sm" onClick={handleDownload}>
                  <Download className="mr-2 h-4 w-4" />
                  Herunterladen
                </Button>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center bg-muted/50 p-8 text-center">
                <FileSpreadsheet className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">Office-Vorschau nicht verfuegbar</p>
                <p className="text-sm text-muted-foreground mt-2 max-w-md">
                  Office-Dokumente aus dem internen Speicher koennen nicht direkt
                  in der Vorschau angezeigt werden. Bitte laden Sie die Datei herunter.
                </p>
                <Button variant="default" className="mt-4" onClick={handleDownload}>
                  <Download className="mr-2 h-4 w-4" />
                  {document.fileName} herunterladen
                </Button>
              </div>
            </div>
          )}

          {!urlLoading && !presignedUrl && error && (
            <div className="flex flex-col items-center justify-center h-64 text-center p-8">
              <FileText className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Fehler beim Laden</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
              <Button
                variant="default"
                className="mt-4"
                onClick={() => window.location.href = `/api/documents/${document.id}/download?redirect=true`}
              >
                <Download className="mr-2 h-4 w-4" />
                Trotzdem herunterladen
              </Button>
            </div>
          )}

          {!urlLoading && presignedUrl && fileType === "unknown" && (
            <div className="flex flex-col items-center justify-center h-64 text-center p-8">
              <FileText className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Vorschau nicht verfuegbar</p>
              <p className="text-sm text-muted-foreground mt-1">
                Fuer diesen Dateityp ist keine Vorschau moeglich.
              </p>
              <Button variant="default" className="mt-4" onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                {document.fileName} herunterladen
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
