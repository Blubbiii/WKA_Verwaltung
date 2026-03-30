"use client";

import { FileText, FileSpreadsheet, Image, File, Download, Eye, Receipt, ChevronLeft, ChevronRight, CheckSquare, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ExplorerFile } from "@/types/document-explorer";
import { CATEGORY_LABELS } from "@/types/document-explorer";

interface FileListProps {
  files: ExplorerFile[];
  loading: boolean;
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onPreview: (file: ExplorerFile) => void;
  onDownload: (file: ExplorerFile) => void;
  pagination: { page: number; limit: number; total: number; totalPages: number };
  onPageChange: (page: number) => void;
}

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return File;
  if (mimeType.includes("pdf")) return FileText;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return FileSpreadsheet;
  if (mimeType.includes("image")) return Image;
  if (mimeType.includes("receipt") || mimeType.includes("invoice")) return Receipt;
  return File;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatCurrency(amount: number | undefined): string {
  if (amount === undefined) return "";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);
}

export function FileList({
  files,
  loading,
  selectedIds,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  onPreview,
  onDownload,
  pagination,
  onPageChange,
}: FileListProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <FileText className="h-12 w-12 mb-3 opacity-30" />
        <p className="text-sm font-medium">Keine Dateien in diesem Ordner</p>
        <p className="text-xs mt-1">Laden Sie Dateien hoch oder wählen Sie einen anderen Ordner</p>
      </div>
    );
  }

  const allSelected = files.length > 0 && files.every((f) => selectedIds.has(f.id));

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center gap-3 px-3 py-2 border-b text-xs text-muted-foreground font-medium">
        <button
          onClick={allSelected ? onClearSelection : onSelectAll}
          className="shrink-0"
          aria-label={allSelected ? "Alle abwählen" : "Alle auswählen"}
        >
          {allSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
        </button>
        <span className="flex-1">Name</span>
        <span className="w-32 text-right hidden sm:block">Typ</span>
        <span className="w-24 text-right hidden md:block">Größe</span>
        <span className="w-24 text-right hidden md:block">Datum</span>
        <span className="w-28 text-right hidden lg:block">Betrag</span>
        <span className="w-20"></span>
      </div>

      {/* File rows */}
      <div className="divide-y">
        {files.map((file) => {
          const Icon = getFileIcon(file.mimeType);
          const isSelected = selectedIds.has(file.id);

          return (
            <div
              key={file.id}
              className={`flex items-center gap-3 px-3 py-2.5 text-sm transition-colors cursor-pointer ${
                isSelected ? "bg-primary/5" : "hover:bg-muted/50"
              }`}
              onClick={() => onPreview(file)}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelection(file.id);
                }}
                className="shrink-0"
              >
                {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}
              </button>

              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />

              <div className="flex-1 min-w-0">
                <p className="truncate font-medium text-foreground">{file.title}</p>
                <p className="truncate text-xs text-muted-foreground">{file.fileName}</p>
              </div>

              <div className="w-32 text-right hidden sm:block">
                <Badge variant="outline" className="text-[10px]">
                  {file.type === "invoice" ? "Rechnung" : CATEGORY_LABELS[file.category] ?? file.category}
                </Badge>
              </div>

              <span className="w-24 text-right text-xs text-muted-foreground hidden md:block">
                {formatFileSize(file.fileSizeBytes)}
              </span>

              <span className="w-24 text-right text-xs text-muted-foreground hidden md:block">
                {formatDate(file.createdAt)}
              </span>

              <span className="w-28 text-right text-xs font-medium hidden lg:block">
                {formatCurrency(file.grossAmount)}
              </span>

              <div className="w-20 flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreview(file);
                  }}
                  aria-label="Vorschau"
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload(file);
                  }}
                  aria-label="Herunterladen"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t text-xs text-muted-foreground">
          <span>
            {pagination.total} Dateien · Seite {pagination.page} von {pagination.totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => onPageChange(pagination.page + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Selection bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground rounded-full px-4 py-2 text-sm font-medium shadow-lg flex items-center gap-3 z-50">
          <span>{selectedIds.size} ausgewählt</span>
          <Button
            variant="secondary"
            size="sm"
            className="h-7 text-xs"
            onClick={onClearSelection}
          >
            Aufheben
          </Button>
        </div>
      )}
    </div>
  );
}
