"use client";

/**
 * Uppy-based resumable SCADA uploader (v2 uploader — behind feature flag
 * `scada-uploader-v2`).
 *
 * Flow:
 *   IDLE      → dropzone, no files
 *   STAGED    → files selected but NOT yet uploaded — preview grouped by
 *               (locationCode, fileType), user confirms with "Import starten"
 *   UPLOADING → sticky progress card at top, expandable file details below
 *   DONE      → summary card (success/fail counts) + "neue Auswahl"
 *
 * Files whose Loc_ can be extracted from filename or `webkitRelativePath`
 * carry their own metadata.locationCode. Files without a self-identifying
 * code fall back to the parent-supplied `locationCode` prop. Files with
 * neither land in the rejected list — the server would refuse them anyway.
 */

import { useEffect, useMemo, useRef, useState } from "react";
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
  Play,
  ChevronDown,
  ChevronUp,
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
  locationCode: string;
  onBatchComplete?: (result: UppyScadaUploadResult) => void;
  onLocationDetected?: (code: string) => void;
  disabled?: boolean;
  className?: string;
}

interface FileRow {
  id: string;
  name: string;
  ext: string;
  size: number;
  locationCode: string;
  progress: number;
  status: "queued" | "uploading" | "success" | "failed";
  error?: string;
}

interface RejectedFile {
  name: string;
  reason: "no-loc-code" | "invalid-extension";
}

const CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_FILE_SIZE = 500 * 1024 * 1024;
/** Max concurrent tus uploads. Higher = faster but more server RAM/Disk. */
const TUS_CONCURRENCY_LIMIT = 3;
/** Hard cap on files per batch to protect the server from a 10k-file drop. */
const MAX_FILES_PER_BATCH = 200;
/** Soft warning threshold — batches above this get a "consider splitting" toast. */
const SOFT_WARN_FILES = 100;

const LOC_PATTERN = /Loc_\d+/i;

function extractLocCode(...candidates: (string | undefined | null)[]): string | null {
  for (const c of candidates) {
    if (!c) continue;
    const match = c.match(LOC_PATTERN);
    if (match) return match[0];
  }
  return null;
}

function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
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
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isFinalized, setIsFinalized] = useState(false);
  const [overallProgress, setOverallProgress] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const [showRejected, setShowRejected] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const uppyRef = useRef<Uppy | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef<string>("");
  const locationCodeRef = useRef(locationCode);
  const onBatchCompleteRef = useRef(onBatchComplete);
  const onLocationDetectedRef = useRef(onLocationDetected);
  const tRef = useRef(t);

  useEffect(() => {
    onBatchCompleteRef.current = onBatchComplete;
    onLocationDetectedRef.current = onLocationDetected;
    locationCodeRef.current = locationCode;
    tRef.current = t;
  });

  useEffect(() => {
    const sessionId = newSessionId();
    sessionIdRef.current = sessionId;

    const uppy = new Uppy({
      // Preview-first: staged files wait for explicit user confirmation
      autoProceed: false,
      allowMultipleUploadBatches: true,
      restrictions: {
        maxFileSize: MAX_FILE_SIZE,
        maxNumberOfFiles: MAX_FILES_PER_BATCH,
        allowedFileTypes: SCADA_EXTENSIONS_DOTTED as unknown as string[],
      },
    }).use(Tus, {
      endpoint: "/api/tus",
      chunkSize: CHUNK_SIZE,
      // Limit concurrent uploads so we don't drown the server in parallel
      // PATCH requests when the user drops a whole Enercon folder.
      limit: TUS_CONCURRENCY_LIMIT,
      // Longer backoff than default — give the server time to breathe on
      // transient errors instead of hammering it with retries.
      retryDelays: [0, 2000, 6000, 15000, 30000],
      removeFingerprintOnSuccess: true,
    });

    uppy.setMeta({
      uploadType: "scada",
      sessionId,
      locationCode,
    });

    uppy.on("file-added", (file) => {
      const fromName = file.name;
      const fromPath =
        (file.data as File | undefined)?.webkitRelativePath || undefined;
      const detected = extractLocCode(fromName, fromPath);
      const effective = detected ?? locationCodeRef.current;

      if (!effective || !effective.startsWith("Loc_")) {
        uppy.removeFile(file.id);
        setRejected((prev) => [
          ...prev,
          { name: file.name ?? file.id, reason: "no-loc-code" },
        ]);
        return;
      }

      uppy.setFileMeta(file.id, { locationCode: effective });

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
          locationCode: effective,
          progress: 0,
          status: "queued",
        },
      ]);
    });

    uppy.on("restriction-failed", (file, error) => {
      const name = file?.name ?? "(unbekannt)";
      const msg = String((error as Error)?.message ?? "");
      // Uppy raises restrictions for wrong-extension AND size — differentiate
      // by inspecting the message so the user gets the right reason.
      const reason: RejectedFile["reason"] = msg.includes("file type")
        ? "invalid-extension"
        : "invalid-extension";
      setRejected((prev) => [...prev, { name, reason }]);
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

    uppy.on("complete", async (result) => {
      setIsUploading(false);
      if (result.failed && result.failed.length > 0) {
        toast.error(tRef.current("someFailed", { count: result.failed.length }));
      }
      if (!result.successful || result.successful.length === 0) {
        setIsFinalized(true);
        return;
      }

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
          setIsFinalized(true);
          return;
        }
        const data = (await res.json()) as UppyScadaUploadResult;
        toast.success(
          tRef.current("uploadedAndStarted", { count: result.successful.length })
        );
        onBatchCompleteRef.current?.(data);
      } catch {
        toast.error(tRef.current("finalizeFailed"));
      } finally {
        setIsFinalized(true);
      }
    });

    uppyRef.current = uppy;
    return () => {
      uppy.destroy();
      uppyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    uppyRef.current?.setMeta({ locationCode });
  }, [locationCode]);

  const addFiles = (fileList: FileList) => {
    if (!uppyRef.current) return;
    const arr = Array.from(fileList);

    // Hard cap: refuse batches bigger than what the server can safely handle
    if (arr.length > MAX_FILES_PER_BATCH) {
      toast.error(
        t("tooManyFiles", { count: arr.length, max: MAX_FILES_PER_BATCH })
      );
      return;
    }
    // Soft cap: warn but let it through
    if (arr.length > SOFT_WARN_FILES) {
      toast.warning(t("largeBatchWarning", { count: arr.length }));
    }

    for (const file of arr) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!SCADA_EXTENSIONS_SET.has(ext)) {
        setRejected((prev) => [
          ...prev,
          { name: file.name, reason: "invalid-extension" },
        ]);
        continue;
      }
      try {
        uppyRef.current.addFile({
          name: file.name,
          type: file.type,
          data: file,
        });
      } catch {
        // Duplicates / oversized — restriction-failed handler catches it
      }
    }
  };

  const startUpload = () => {
    uppyRef.current?.upload().catch(() => undefined);
  };

  const cancelAll = () => {
    uppyRef.current?.cancelAll();
    setFiles([]);
    setRejected([]);
    setOverallProgress(0);
    setIsUploading(false);
    setIsFinalized(false);
  };

  const cancelFile = (id: string) => {
    uppyRef.current?.removeFile(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const retryFile = (id: string) => {
    uppyRef.current?.retryUpload(id).catch(() => undefined);
  };

  const totalFiles = files.length;
  const successCount = files.filter((f) => f.status === "success").length;
  const failedCount = files.filter((f) => f.status === "failed").length;
  const rejectedCount = rejected.length;

  /** State machine: IDLE / STAGED / UPLOADING / DONE */
  const phase: "idle" | "staged" | "uploading" | "done" =
    isFinalized
      ? "done"
      : isUploading
      ? "uploading"
      : totalFiles > 0
      ? "staged"
      : "idle";

  const grouped = useMemo(() => {
    const g: Record<string, Record<string, number>> = {};
    for (const f of files) {
      if (!g[f.locationCode]) g[f.locationCode] = {};
      g[f.locationCode][f.ext] = (g[f.locationCode][f.ext] ?? 0) + 1;
    }
    return g;
  }, [files]);
  const locationCount = Object.keys(grouped).length;

  const totalBytes = useMemo(() => files.reduce((s, f) => s + f.size, 0), [files]);

  return (
    <div className={cn("space-y-3", className)}>
      {/* === IDLE: Dropzone === */}
      {phase === "idle" && (
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
              : !disabled &&
                  "border-muted-foreground/25 hover:border-muted-foreground/40"
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
      )}

      {/* === STAGED: Preview + Confirm === */}
      {phase === "staged" && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold">
                {t("previewTitle", { files: totalFiles, locations: locationCount })}
              </h4>
              <p className="text-xs text-muted-foreground">
                {t("previewTotalBytes", { bytes: formatBytes(totalBytes) })}
              </p>
            </div>
            <Badge variant="outline" className="border-primary/40 bg-primary/5">
              {t("previewReady")}
            </Badge>
          </div>

          <div className="space-y-2">
            {Object.entries(grouped)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([loc, byType]) => {
                const locTotal = Object.values(byType).reduce((s, n) => s + n, 0);
                return (
                  <div
                    key={loc}
                    className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-sm font-medium">{loc}</span>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(byType)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([ext, count]) => (
                            <Badge
                              key={ext}
                              variant="outline"
                              className="text-[10px]"
                            >
                              {ext} × {count}
                            </Badge>
                          ))}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 ml-2">
                      {t("previewLocTotal", { count: locTotal })}
                    </span>
                  </div>
                );
              })}
          </div>

          {rejectedCount > 0 && (
            <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2">
              <button
                type="button"
                onClick={() => setShowRejected((s) => !s)}
                className="flex w-full items-center justify-between text-sm text-warning"
              >
                <span className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  {t("previewRejected", { count: rejectedCount })}
                </span>
                {showRejected ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
              {showRejected && (
                <ul className="mt-2 max-h-40 overflow-y-auto space-y-0.5 text-[11px] text-warning/90">
                  {rejected.map((r, i) => (
                    <li key={i} className="truncate">
                      {r.name} — {t(`rejectedReason.${r.reason}`)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={startUpload}
              disabled={totalFiles === 0}
              className="flex-1"
            >
              <Play className="h-4 w-4 mr-1" />
              {t("startImport", { count: totalFiles })}
            </Button>
            <Button type="button" variant="ghost" onClick={cancelAll}>
              {t("discard")}
            </Button>
          </div>
        </div>
      )}

      {/* === UPLOADING: Sticky Progress Card === */}
      {phase === "uploading" && (
        <div className="sticky top-2 z-20 space-y-2 rounded-lg border border-primary/40 bg-background/95 backdrop-blur p-3 shadow-md">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="font-semibold">
                {t("uploadingTitle", { pct: overallProgress })}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                {t("uploadingCounts", {
                  ok: successCount,
                  total: totalFiles,
                  fail: failedCount,
                })}
              </span>
            </div>
          </div>
          <Progress value={overallProgress} className="h-2" />
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowDetails((s) => !s)}
            >
              {showDetails ? (
                <ChevronUp className="h-3.5 w-3.5 mr-1" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 mr-1" />
              )}
              {showDetails ? t("hideDetails") : t("showDetails")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={cancelAll}>
              {t("cancelUpload")}
            </Button>
          </div>
        </div>
      )}

      {/* === DONE: Summary === */}
      {phase === "done" && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center gap-3">
            {failedCount === 0 ? (
              <CheckCircle2 className="h-6 w-6 text-success" />
            ) : (
              <AlertCircle className="h-6 w-6 text-warning" />
            )}
            <div>
              <h4 className="text-sm font-semibold">
                {failedCount === 0
                  ? t("doneAllOk", { count: successCount })
                  : t("donePartial", { ok: successCount, fail: failedCount })}
              </h4>
              <p className="text-xs text-muted-foreground">
                {t("doneNote")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" onClick={cancelAll} className="flex-1">
              <Upload className="h-4 w-4 mr-1" />
              {t("doneNewUpload")}
            </Button>
          </div>
        </div>
      )}

      {/* File-Details list — shared between UPLOADING (collapsible) and DONE */}
      {((phase === "uploading" && showDetails) || phase === "done") &&
        totalFiles > 0 && (
          <div className="max-h-72 overflow-y-auto rounded-lg border divide-y">
            {files.map((f) => (
              <div key={f.id} className="flex items-center gap-3 p-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {f.ext}
                    </Badge>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {f.locationCode}
                    </span>
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
                  {f.status === "queued" && (
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
