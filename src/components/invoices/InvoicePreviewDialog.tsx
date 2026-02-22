"use client";

import dynamic from "next/dynamic";
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
  Maximize2,
  Minimize2,
  Printer,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Dynamically import the PDF viewer component to avoid SSR issues
const PDFViewerContent = dynamic(
  () => import("../documents/DocumentPreviewDialogPDF").then((mod) => mod.DocumentPreviewDialogPDF),
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

interface InvoicePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string | null;
  invoiceNumber?: string;
}

export function InvoicePreviewDialog({
  open,
  onOpenChange,
  invoiceId,
  invoiceNumber,
}: InvoicePreviewDialogProps) {
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);

  // Fetch PDF preview when invoice changes
  useEffect(() => {
    if (invoiceId && open) {
      setPageNumber(1);
      setScale(1.0);
      setRotation(0);
      setLoading(true);
      setError(null);
      setPdfDataUrl(null);

      // Fetch PDF as base64 from preview endpoint
      fetch(`/api/invoices/${invoiceId}/preview`)
        .then((res) => {
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          return res.json();
        })
        .then((data) => {
          if (data.base64) {
            // Convert base64 to data URL
            const dataUrl = `data:application/pdf;base64,${data.base64}`;
            setPdfDataUrl(dataUrl);
          } else {
            setError("PDF konnte nicht generiert werden");
          }
        })
        .catch(() => {
          setError("Fehler beim Laden der Vorschau");
        })
        .finally(() => setLoading(false));
    }
  }, [invoiceId, open]);

  if (!invoiceId) return null;

  function handleDownload() {
    // Open PDF in new tab for download
    window.open(`/api/invoices/${invoiceId}/pdf`, "_blank");
  }

  function handlePrint() {
    // Open PDF for printing
    window.open(`/api/invoices/${invoiceId}/pdf?inline=true`, "_blank");
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
            <DialogTitle className="truncate flex-1">
              Vorschau: {invoiceNumber || "Rechnung"}
            </DialogTitle>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={handlePrint} title="Drucken">
                <Printer className="h-4 w-4" />
              </Button>
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
          {loading && (
            <div className="flex flex-col items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">PDF wird generiert...</p>
            </div>
          )}

          {!loading && pdfDataUrl && (
            <Suspense
              fallback={
                <div className="flex flex-col items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">PDF wird geladen...</p>
                </div>
              }
            >
              <PDFViewerContent
                fileUrl={pdfDataUrl}
                pageNumber={pageNumber}
                numPages={numPages}
                scale={scale}
                rotation={rotation}
                loading={false}
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

          {!loading && error && (
            <div className="flex flex-col items-center justify-center h-64 text-center p-8">
              <FileText className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">Fehler beim Laden</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
              <Button variant="default" className="mt-4" onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                PDF herunterladen
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
