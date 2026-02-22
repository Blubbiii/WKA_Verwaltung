"use client";

import { useState, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Loader2,
  FileText,
  Download,
} from "lucide-react";

interface DocumentPreviewDialogPDFProps {
  fileUrl: string;
  pageNumber: number;
  numPages: number | null;
  scale: number;
  rotation: number;
  loading: boolean;
  error: string | null;
  onDocumentLoadSuccess: ({ numPages }: { numPages: number }) => void;
  onDocumentLoadError: (err: Error) => void;
  goToPrevPage: () => void;
  goToNextPage: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  rotate: () => void;
  handleDownload: () => void;
}

export function DocumentPreviewDialogPDF({
  fileUrl,
  pageNumber,
  numPages,
  scale,
  rotation,
  loading,
  error,
  onDocumentLoadSuccess,
  onDocumentLoadError,
  goToPrevPage,
  goToNextPage,
  zoomIn,
  zoomOut,
  rotate,
  handleDownload,
}: DocumentPreviewDialogPDFProps) {
  const [workerReady, setWorkerReady] = useState(false);

  // Configure PDF.js worker on mount using local file
  // Worker is copied from node_modules to public/ folder
  useEffect(() => {
    // Use local worker for reliability (no CDN dependency)
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    setWorkerReady(true);
  }, []);

  if (!workerReady) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">PDF-Viewer wird initialisiert...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* PDF Controls */}
      <div className="flex items-center justify-center gap-2 p-2 border-b bg-background">
        <Button variant="outline" size="icon" onClick={goToPrevPage} disabled={pageNumber <= 1}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm min-w-[100px] text-center">
          Seite {pageNumber} von {numPages || "..."}
        </span>
        <Button
          variant="outline"
          size="icon"
          onClick={goToNextPage}
          disabled={pageNumber >= (numPages || 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="w-px h-6 bg-border mx-2" />
        <Button variant="outline" size="icon" onClick={zoomOut} disabled={scale <= 0.5}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <span className="text-sm min-w-[60px] text-center">{Math.round(scale * 100)}%</span>
        <Button variant="outline" size="icon" onClick={zoomIn} disabled={scale >= 3}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={rotate}>
          <RotateCw className="h-4 w-4" />
        </Button>
      </div>

      {/* PDF Viewer */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-4">
        {loading && (
          <div className="flex flex-col items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">PDF wird geladen...</p>
          </div>
        )}
        {error && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <FileText className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{error}</p>
            <Button variant="outline" className="mt-4" onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              Datei herunterladen
            </Button>
          </div>
        )}
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading=""
          className={loading || error ? "hidden" : ""}
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            rotate={rotation}
            renderTextLayer={true}
            renderAnnotationLayer={true}
          />
        </Document>
      </div>
    </div>
  );
}
