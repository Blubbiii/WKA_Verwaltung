"use client";

/**
 * Uppy-based resumable SCADA uploader (v2 uploader — behind feature flag
 * `scada-uploader-v2`).
 *
 * Uploads each dropped file via tus to `/api/tus`. Once the whole batch is
 * done (all files finished or failed), calls `/api/energy/scada/tus/finalize`
 * to start SCADA import jobs grouped by (locationCode, fileType). All files
 * in one batch share a `sessionId` that scopes them server-side.
 *
 * Resumability: if the connection drops mid-chunk, tus resumes at the last
 * offset the server ack'd. Cache is kept in localStorage keyed by URL — a
 * page reload also resumes rather than restarting.
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
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  SCADA_EXTENSIONS_DOTTED,
  SCADA_EXTENSIONS_SET,
} from "@/lib/scada/file-types";

export interface UppyScadaUploadResult {
  sessionId: string;
  imports: Array<{
    locationCode: string;
    fileType: string;
    importLogId: string;
    fileCount: number;
  }>;
}

interface UppyScadaUploadProps {
  /**
   * Fallback Enercon Location-Code (e.g. "Loc_5842"). Applied to any file
   * whose Loc_ can NOT be detected from its name or folder path. Optional —
   * files that carry their own Loc_ don't need it.
   */
  locationCode: string;
  /** Fires once the whole batch is finalized on the server */
  onBatchComplete?: (result: UppyScadaUploadResult) => void;
  /**
   * Called when the uploader auto-detects a Loc_ code from the first file
   * of a batch. The parent can sync its Loc_-input for user feedback.
   */
  onLocationDetected?: (code: string) => void;
  disabled?: boolean;
  className?: string;
}

/** Regex matching Enercon location codes like Loc_5842. */
const LOC_PATTERN = /Loc_\d+/i;

/** Try to pull a Loc_XXXX code out of a filename or folder path. */
function extractLocCode(...candidates: (string | undefined | null)[]): string | null {
  for (const c of candidates) {
    if (!c) continue;
    const match = c.match(LOC_PATTERN);
    if (match) return match[0];
  }
  return null;
}

interface FileRow {
  id: string;
  name: string;
  ext: string;
  size: number;
  progress: number; // 0..100
  status: "queued" | "uploading" | "success" | "failed";
  error?: string;
}

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
// Matches TUS_MAX_SIZE_BYTES on the server
const MAX_FILE_SIZE = 500 * 1024 * 1024;

/** Cross-browser sessionId — falls back if crypto.randomUUID is unavailable. */
function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function UppyScadaUpload({
  locationCode,
  onBatchComplete,
  onLocationDetected,
  disabled,
  className,
}: UppyScadaUploadProps) {
  const t = useTranslations("energy.scada.uploader");
  const [files, setFiles] = useState<FileRow[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const uppyRef = useRef<Uppy | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef<string>("");
  const locationCodeRef = useRef(locationCode);
  const onBatchCompleteRef = useRef(onBatchComplete);
  const onLocationDetectedRef = useRef(onLocationDetected);
  const tRef = useRef(t);

  // Keep callback refs in sync so we don't need to re-init Uppy on prop change
  useEffect(() => {
    onBatchCompleteRef.current = onBatchComplete;
    onLocationDetectedRef.current = onLocationDetected;
    locationCodeRef.current = locationCode;
    tRef.current = t;
  });

  // Init Uppy once — locationCode changes are pushed via setMeta below
  useEffect(() => {
    const sessionId = newSessionId();
    sessionIdRef.current = sessionId;

    const uppy = new Uppy({
      autoProceed: true,
      allowMultipleUploadBatches: true,
      restrictions: {
        maxFileSize: MAX_FILE_SIZE,
        allowedFileTypes: SCADA_EXTENSIONS_DOTTED as unknown as string[],
      },
    }).use(Tus, {
      endpoint: "/api/tus",
      chunkSize: CHUNK_SIZE,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      removeFingerprintOnSuccess: true,
    });

    uppy.setMeta({
      uploadType: "scada",
      sessionId,
      locationCode,
    });

    uppy.on("file-added", (file) => {
      // Auto-detect Loc_XXXX from the filename or the folder path (when
      // the file came in via <input webkitdirectory>). Falls back to the
      // parent-provided locationCode if no self-identifying code is found.
      const fromName = file.name;
      const fromPath =
        (file.data as File | undefined)?.webkitRelativePath || undefined;
      const detected = extractLocCode(fromName, fromPath);
      const effective = detected ?? locationCodeRef.current;

      if (!effective || !effective.startsWith("Loc_")) {
        // Reject rather than uploading with an empty locationCode — server
        // would refuse it downstream anyway.
        toast.error(tRef.current("noLocationInFile", { name: file.name }));
        uppy.removeFile(file.id);
        return;
      }

      // Apply this file's own Loc_ so a batch mixing multiple locations
      // still gets grouped correctly server-side.
      uppy.setFileMeta(file.id, { locationCode: effective });

      // Sync back to parent for user feedback (first detected wins)
      if (detected && !locationCodeRef.current) {
        onLocationDetectedRef.current?.(detected);
      }

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

    uppy.on("progress", (percent) => {
      setOverallProgress(percent);
    });

    uppy.on("complete", async (result) => {
      setIsUploading(false);
      if (result.failed && result.failed.length > 0) {
        toast.error(tRef.current("someFailed", { count: result.failed.length }));
      }
      if (!result.successful || result.successful.length === 0) return;

      try {
        const res = await fetch("/api/energy/scada/tus/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          toast.error(errBody.error ?? tRef.current("finalizeFailed"));
          return;
        }
        const data = (await res.json()) as UppyScadaUploadResult;
        toast.success(
          tRef.current("uploadedAndStarted", {
            count: result.successful.length,
          })
        );
        onBatchCompleteRef.current?.(data);
      } catch {
        toast.error(tRef.current("finalizeFailed"));
      }
    });

    uppyRef.current = uppy;

    return () => {
      uppy.destroy();
      uppyRef.current = null;
    };
    // We intentionally omit locationCode / callbacks from deps to avoid
    // re-creating Uppy — changes are pushed via setMeta / refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push locationCode changes into Uppy meta without re-init
  useEffect(() => {
    uppyRef.current?.setMeta({ locationCode });
  }, [locationCode]);

  const addFiles = (fileList: FileList) => {
    if (!uppyRef.current) return;
    for (const file of Array.from(fileList)) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!SCADA_EXTENSIONS_SET.has(ext)) {
        toast.error(t("invalidExtension", { name: file.name, ext }));
        continue;
      }
      try {
        uppyRef.current.addFile({
          name: file.name,
          type: file.type,
          data: file,
        });
      } catch (err) {
        // Uppy throws on duplicate / size restriction
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
    uppyRef.current?.retryUpload(id).catch(() => {
      /* toast is emitted by upload-error handler */
    });
  };

  const totalFiles = files.length;
  const successCount = files.filter((f) => f.status === "success").length;
  const failedCount = files.filter((f) => f.status === "failed").length;

  return (
    <div className={cn("space-y-3", className)}>
      <div
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          if (disabled) return;
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center transition-colors",
          disabled && "opacity-50 pointer-events-none",
          !disabled && isDragging
            ? "border-primary bg-primary/5"
            : !disabled && "border-muted-foreground/25 hover:border-muted-foreground/40"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept={SCADA_EXTENSIONS_DOTTED.join(",")}
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
          disabled={disabled}
        />
        <input
          ref={folderInputRef}
          type="file"
          {...({ webkitdirectory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
          disabled={disabled}
        />
        <div className="flex flex-col items-center gap-2">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">{t("dropOrClick")}</p>
          <p className="text-xs text-muted-foreground">
            {locationCode
              ? t("hintWithFallback", { code: locationCode })
              : t("hintAutoDetect")}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => folderInputRef.current?.click()}
              disabled={disabled}
            >
              <FolderOpen className="h-4 w-4 mr-1" />
              {t("selectFolder")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
            >
              {t("selectFiles")}
            </Button>
          </div>
        </div>
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
