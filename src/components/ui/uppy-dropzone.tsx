"use client";

/**
 * Generic Uppy + tus resumable dropzone — drop-in replacement for the
 * legacy `FileUploadDropzone`. Same props signature so call-sites don't
 * need to change; the swap happens inside `FileUploadDropzone` under the
 * `uploader-v2-generic` feature flag.
 *
 * Streams every file to `/api/tus` (uploadType=s3). The server dispatcher
 * stores the file in MinIO and returns { s3Key, signedUrl } — but the
 * consumer only sees success/failure via onUploadComplete(), matching the
 * V1 semantics.
 *
 * additionalFields become metadata on every file (server sees them as
 * `metadata.<key>`) so category, parentEntityType, parentEntityId etc.
 * arrive at the S3 dispatcher.
 */

import { useEffect, useRef, useState } from "react";
import Uppy from "@uppy/core";
import Tus from "@uppy/tus";
import { useTranslations } from "next-intl";
import {
  Upload,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface UppyDropzoneProps {
  /** API endpoint for POST upload — kept for API compat with FileUploadDropzone,
   *  but always sends via /api/tus. `endpoint` is passed as `metadata.legacyEndpoint`
   *  so server-side logic can differentiate if ever needed. */
  endpoint: string;
  /** Additional metadata attached to every file (category, parentEntityType, …). */
  additionalFields?: Record<string, string>;
  /** Accepted file types (input `accept` attr, comma-separated with dots). */
  accept?: string;
  /** Max concurrent files per batch. */
  maxFiles?: number;
  /** Callback after successful upload of at least one file. */
  onUploadComplete: () => void;
  disabled?: boolean;
  className?: string;
  hint?: string;
}

interface FileRow {
  id: string;
  name: string;
  ext: string;
  size: number;
  progress: number;
  status: "queued" | "uploading" | "success" | "failed";
  error?: string;
}

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
/** Max concurrent tus uploads. Match server-side capacity. */
const TUS_CONCURRENCY_LIMIT = 3;
const DEFAULT_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.csv,.txt";

/** Guess a `category` from the endpoint URL when the caller doesn't set one. */
function inferCategory(endpoint: string, additional?: Record<string, string>): string {
  if (additional?.category) return additional.category.toLowerCase();
  if (endpoint.includes("/inbox")) return "document";
  if (endpoint.includes("/documents")) return "document";
  if (endpoint.includes("/letterhead")) return "letterhead";
  if (endpoint.includes("/logo")) return "logo";
  if (endpoint.includes("/avatar")) return "avatar";
  if (endpoint.includes("/marketing-video")) return "marketing-video";
  return "document";
}

export function UppyDropzone({
  endpoint,
  additionalFields,
  accept = DEFAULT_ACCEPT,
  maxFiles = 10,
  onUploadComplete,
  disabled,
  className,
  hint,
}: UppyDropzoneProps) {
  const t = useTranslations("common.uppy");
  const [files, setFiles] = useState<FileRow[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const uppyRef = useRef<Uppy | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const onCompleteRef = useRef(onUploadComplete);
  const tRef = useRef(t);

  useEffect(() => {
    onCompleteRef.current = onUploadComplete;
    tRef.current = t;
  });

  useEffect(() => {
    const uppy = new Uppy({
      autoProceed: true,
      allowMultipleUploadBatches: true,
      restrictions: {
        maxFileSize: DEFAULT_MAX_FILE_SIZE,
        maxNumberOfFiles: maxFiles,
        // Uppy compares allowedFileTypes case-sensitively against the file
        // extension → iOS-Kamera-Fotos ("IMG_0001.JPG") würden von einer
        // Allowlist mit nur `.jpg` abgewiesen. Wir expandieren jede
        // Dot-Extension in lower- und upper-case, MIME-Types bleiben unverändert.
        allowedFileTypes: accept
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .flatMap((entry) => {
            if (entry.startsWith(".")) {
              const lower = entry.toLowerCase();
              const upper = entry.toUpperCase();
              return lower === upper ? [lower] : [lower, upper];
            }
            return [entry];
          }),
      },
    }).use(Tus, {
      endpoint: "/api/tus",
      chunkSize: CHUNK_SIZE,
      limit: TUS_CONCURRENCY_LIMIT,
      retryDelays: [0, 2000, 6000, 15000, 30000],
      removeFingerprintOnSuccess: true,
    });

    // Every file inherits this metadata. filename + filetype are set by
    // Uppy per file; additionalFields (category, parentEntityId, …) pass
    // through as-is to the tus server → S3 dispatcher.
    uppy.setMeta({
      uploadType: "s3",
      category: inferCategory(endpoint, additionalFields),
      legacyEndpoint: endpoint,
      ...(additionalFields ?? {}),
    });

    uppy.on("file-added", (file) => {
      setFiles((prev) => [
        ...prev,
        {
          id: file.id,
          name: file.name ?? file.id,
          ext: ((file.name ?? "").split(".").pop() ?? "").toUpperCase(),
          size: file.size ?? 0,
          progress: 0,
          status: "queued",
        },
      ]);
    });

    uppy.on("upload", () => setIsUploading(true));

    uppy.on("upload-progress", (file, progress) => {
      if (!file || !progress.bytesTotal) return;
      const pct = Math.round((progress.bytesUploaded / progress.bytesTotal) * 100);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === file.id ? { ...f, progress: pct, status: "uploading" } : f
        )
      );
    });

    uppy.on("upload-success", (file) => {
      if (!file) return;
      setFiles((prev) =>
        prev.map((f) =>
          f.id === file.id ? { ...f, progress: 100, status: "success" } : f
        )
      );
    });

    uppy.on("upload-error", (file, err) => {
      if (!file) return;
      const msg = err instanceof Error ? err.message : String(err);
      setFiles((prev) =>
        prev.map((f) =>
          f.id === file.id ? { ...f, status: "failed", error: msg } : f
        )
      );
    });

    uppy.on("progress", (percent) => setOverallProgress(percent));

    uppy.on("complete", (result) => {
      setIsUploading(false);
      if (result.failed && result.failed.length > 0) {
        toast.error(tRef.current("someFailed", { count: result.failed.length }));
      }
      if (result.successful && result.successful.length > 0) {
        toast.success(
          tRef.current("uploadedSuccess", { count: result.successful.length })
        );
        onCompleteRef.current();
      }
    });

    uppyRef.current = uppy;
    return () => {
      uppy.destroy();
      uppyRef.current = null;
    };
    // additionalFields intentionally excluded — updated via setMeta effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, accept, maxFiles]);

  useEffect(() => {
    uppyRef.current?.setMeta({
      uploadType: "s3",
      category: inferCategory(endpoint, additionalFields),
      legacyEndpoint: endpoint,
      ...(additionalFields ?? {}),
    });
  }, [endpoint, additionalFields]);

  const addFiles = (fileList: FileList) => {
    if (!uppyRef.current) return;
    for (const file of Array.from(fileList)) {
      try {
        uppyRef.current.addFile({
          name: file.name,
          type: file.type,
          data: file,
        });
      } catch (err) {
        toast.error((err as Error).message);
      }
    }
  };

  const cancelFile = (id: string) => {
    uppyRef.current?.removeFile(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };
  const clearAll = () => {
    uppyRef.current?.cancelAll();
    setFiles([]);
    setOverallProgress(0);
  };
  const retryFile = (id: string) => {
    uppyRef.current?.retryUpload(id).catch(() => undefined);
  };

  if (disabled) return null;

  const totalFiles = files.length;
  const successCount = files.filter((f) => f.status === "success").length;
  const failedCount = files.filter((f) => f.status === "failed").length;

  return (
    <div className={cn("space-y-3", className)}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "border-2 border-dashed rounded-lg p-4 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/20 hover:border-muted-foreground/40"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept={accept}
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <label className="cursor-pointer flex flex-col items-center gap-1">
          <Upload className="h-5 w-5 text-muted-foreground" />
          <span className="text-xs">
            {t("dragOrSelect")}{" "}
            <button
              type="button"
              className="text-primary underline"
              onClick={() => inputRef.current?.click()}
            >
              {t("select")}
            </button>
          </span>
          {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
        </label>
      </div>

      {totalFiles > 0 && (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {t("overallProgress", { pct: overallProgress })}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">
                {t("counts", {
                  total: totalFiles,
                  ok: successCount,
                  fail: failedCount,
                })}
              </span>
              {!isUploading && (
                <Button size="sm" variant="ghost" onClick={clearAll}>
                  {t("clearAll")}
                </Button>
              )}
            </div>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </div>
      )}

      {totalFiles > 0 && (
        <div className="max-h-72 overflow-y-auto rounded-lg border divide-y">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-3 p-2 text-sm">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {f.ext}
                  </Badge>
                  <span className="truncate">{f.name}</span>
                </div>
                <Progress value={f.progress} className="h-1 mt-1" />
                {f.status === "failed" && f.error && (
                  <p className="text-[10px] text-destructive truncate mt-0.5">
                    {f.error}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {f.status === "success" && (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                )}
                {f.status === "uploading" && (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
                {f.status === "failed" && (
                  <>
                    <AlertCircle
                      className="h-4 w-4 text-destructive"
                      aria-label={f.error}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => retryFile(f.id)}
                      title={t("retry")}
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                {(f.status === "queued" || f.status === "failed") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => cancelFile(f.id)}
                    title={t("cancel")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
