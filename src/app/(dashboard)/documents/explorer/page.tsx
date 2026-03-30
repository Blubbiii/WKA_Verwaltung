"use client";

import { useCallback } from "react";
import { FolderTree as FolderTreeIcon, Download, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useDocumentExplorer } from "@/hooks/useDocumentExplorer";
import { FolderTree } from "@/components/documents/explorer/folder-tree";
import { FileList } from "@/components/documents/explorer/file-list";
import { BreadcrumbPath } from "@/components/documents/explorer/breadcrumb-path";
import { UploadDropzone } from "@/components/documents/explorer/upload-dropzone";
import { TaxExportDialog } from "@/components/documents/explorer/tax-export-dialog";
import type { ExplorerFile } from "@/types/document-explorer";

export default function DocumentExplorerPage() {
  const {
    tree,
    unassigned,
    treeLoading,
    activePath,
    setActivePath,
    files,
    filesLoading,
    pagination,
    setPage,
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    refreshTree,
    refreshFiles,
  } = useDocumentExplorer();

  const handlePreview = useCallback((file: ExplorerFile) => {
    // Open file in new tab via signed URL
    window.open(`/api/documents/${file.id}/download`, "_blank");
  }, []);

  const handleDownload = useCallback((file: ExplorerFile) => {
    const a = document.createElement("a");
    a.href = `/api/documents/${file.id}/download`;
    a.download = file.fileName;
    a.click();
  }, []);

  const handleBulkDownload = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const docIds = files.filter((f) => f.type === "document" && selectedIds.has(f.id)).map((f) => f.id);
    const invIds = files.filter((f) => f.type === "invoice" && selectedIds.has(f.id)).map((f) => f.id);

    try {
      const res = await fetch("/api/documents/explorer/download-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentIds: docIds.length > 0 ? docIds : undefined,
          invoiceIds: invIds.length > 0 ? invIds : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Download fehlgeschlagen");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dokumente-${new Date().toISOString().split("T")[0]}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Download gestartet");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download fehlgeschlagen");
    }
  }, [selectedIds, files]);

  const handleUploadComplete = useCallback(() => {
    refreshTree();
    refreshFiles();
  }, [refreshTree, refreshFiles]);

  const handleBreadcrumbNavigate = useCallback((level: "root" | "park" | "year") => {
    if (level === "root") setActivePath(null);
    // park and year levels just collapse — user picks from tree
  }, [setActivePath]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link href="/documents">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              Zurück
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <FolderTreeIcon className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Dokumenten-Explorer</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleBulkDownload}>
              <Download className="h-3.5 w-3.5" />
              {selectedIds.size} als ZIP
            </Button>
          )}
          <TaxExportDialog parks={tree} />
        </div>
      </div>

      {/* Split view */}
      <div className="flex-1 grid grid-cols-[280px_1fr] gap-4 min-h-0">
        {/* Left: Folder tree */}
        <div className="border rounded-lg bg-background overflow-y-auto">
          <div className="px-3 py-2 border-b">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ordner</h2>
          </div>
          <FolderTree
            tree={tree}
            unassigned={unassigned}
            loading={treeLoading}
            activePath={activePath}
            onSelect={setActivePath}
          />
        </div>

        {/* Right: Files */}
        <div className="border rounded-lg bg-background flex flex-col min-h-0">
          <div className="px-3 border-b shrink-0">
            <BreadcrumbPath path={activePath} onNavigate={handleBreadcrumbNavigate} />
          </div>

          <div className="flex-1 overflow-y-auto">
            {activePath ? (
              <>
                <FileList
                  files={files}
                  loading={filesLoading}
                  selectedIds={selectedIds}
                  onToggleSelection={toggleSelection}
                  onSelectAll={selectAll}
                  onClearSelection={clearSelection}
                  onPreview={handlePreview}
                  onDownload={handleDownload}
                  pagination={pagination}
                  onPageChange={setPage}
                />
                <div className="px-3 pb-3">
                  <UploadDropzone
                    activePath={activePath}
                    onUploadComplete={handleUploadComplete}
                  />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FolderTreeIcon className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">Ordner auswählen</p>
                <p className="text-xs mt-1">Wählen Sie links einen Ordner um Dateien anzuzeigen</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
