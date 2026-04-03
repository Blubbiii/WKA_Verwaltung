"use client";

import { useState, useCallback } from "react";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Generic drag & drop file upload zone.
 *
 * Usage:
 * ```tsx
 * <FileUploadDropzone
 *   endpoint="/api/documents"
 *   additionalFields={{ parkId: park.id, category: "GENERAL" }}
 *   onUploadComplete={() => refetch()}
 * />
 * ```
 */

interface FileUploadDropzoneProps {
  /** API endpoint for POST upload (FormData) */
  endpoint: string;
  /** Extra fields appended to FormData (e.g. parkId, category) */
  additionalFields?: Record<string, string>;
  /** Accepted file types (input accept attr) */
  accept?: string;
  /** Max concurrent files */
  maxFiles?: number;
  /** Callback after successful upload */
  onUploadComplete: () => void;
  disabled?: boolean;
  className?: string;
  /** Custom hint text below the icon */
  hint?: string;
}

const DEFAULT_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.csv,.txt";

export function FileUploadDropzone({
  endpoint,
  additionalFields,
  accept = DEFAULT_ACCEPT,
  maxFiles = 10,
  onUploadComplete,
  disabled = false,
  className,
  hint,
}: FileUploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleUpload = useCallback(
    async (files: FileList) => {
      const fileList = Array.from(files).slice(0, maxFiles);
      if (fileList.length === 0) return;

      setUploading(true);
      let successCount = 0;

      for (const file of fileList) {
        try {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("title", file.name.replace(/\.[^.]+$/, ""));

          if (additionalFields) {
            for (const [key, value] of Object.entries(additionalFields)) {
              formData.append(key, value);
            }
          }

          const res = await fetch(endpoint, {
            method: "POST",
            body: formData,
          });

          if (res.ok) {
            successCount++;
          } else {
            const err = await res.json().catch(() => ({}));
            toast.error(
              `Fehler bei ${file.name}: ${err.error || "Upload fehlgeschlagen"}`
            );
          }
        } catch {
          toast.error(`Fehler bei ${file.name}`);
        }
      }

      setUploading(false);
      if (successCount > 0) {
        toast.success(
          `${successCount} Datei${successCount > 1 ? "en" : ""} hochgeladen`
        );
        onUploadComplete();
      }
    },
    [endpoint, additionalFields, maxFiles, onUploadComplete]
  );

  if (disabled) return null;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files);
      }}
      className={`border-2 border-dashed rounded-lg p-4 text-center transition-colors ${
        isDragging
          ? "border-primary bg-primary/5 text-primary"
          : "border-muted-foreground/20 text-muted-foreground hover:border-muted-foreground/40"
      } ${className ?? ""}`}
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
            Dateien hierher ziehen oder{" "}
            <span className="text-primary underline">auswählen</span>
          </span>
          {hint && <span className="text-[10px]">{hint}</span>}
          <input
            type="file"
            multiple
            className="hidden"
            accept={accept}
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
