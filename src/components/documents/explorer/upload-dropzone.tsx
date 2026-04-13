"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { FolderPath } from "@/types/document-explorer";

interface UploadDropzoneProps {
  activePath: FolderPath | null;
  onUploadComplete: () => void;
}

export function UploadDropzone({ activePath, onUploadComplete }: UploadDropzoneProps) {
  const tToast = useTranslations("documents.toasts");
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleUpload = useCallback(async (files: FileList) => {
    if (!activePath) {
      toast.error(tToast("selectFolderFirst"));
      return;
    }

    setUploading(true);
    let successCount = 0;

    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("title", file.name.replace(/\.[^.]+$/, ""));
        formData.append("category", activePath.category === "INVOICE_PDF" ? "INVOICE" : activePath.category);
        if (activePath.parkId) formData.append("parkId", activePath.parkId);

        const res = await fetch("/api/documents", {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          successCount++;
        } else {
          const err = await res.json().catch(() => ({}));
          toast.error(tToast("uploadFileFailed", { file: file.name, error: err.error || tToast("uploadFailed") }));
        }
      } catch {
        toast.error(tToast("uploadFileFailedSimple", { file: file.name }));
      }
    }

    setUploading(false);
    if (successCount > 0) {
      toast.success(tToast("filesUploaded", { count: successCount }));
      onUploadComplete();
    }
  }, [activePath, onUploadComplete, tToast]);

  if (!activePath || activePath.category === "INVOICE_PDF") return null;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files);
      }}
      className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors mt-2 ${
        isDragging
          ? "border-primary bg-primary/5 text-primary"
          : "border-muted-foreground/20 text-muted-foreground hover:border-muted-foreground/40"
      }`}
    >
      {uploading ? (
        <div className="flex items-center justify-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Wird hochgeladen...</span>
        </div>
      ) : (
        <label className="cursor-pointer flex flex-col items-center gap-1">
          <Upload className="h-5 w-5" />
          <span className="text-xs">
            Dateien hierher ziehen oder <span className="text-primary underline">auswählen</span>
          </span>
          <span className="text-[10px]">
            → wird abgelegt in: {activePath.parkName} / {activePath.year} / {activePath.categoryLabel}
          </span>
          <input
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.csv,.txt"
            onChange={(e) => {
              if (e.target.files?.length) handleUpload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}
