"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// Union über die zwei Fehler-Payload-Formate, die die API zurückgeben kann:
//  1. Neues Format aus `apiError(...)`: { code, error, details? }
//  2. Legacy-Handler: { error: "…" } oder plain-Strings aus Reverse-Proxies.
// Der Fallback-Chain-Reader bleibt lesbar und muss NICHT jedes neue Feld kennen.
type ApiErrorLike =
  | { error?: string; code?: string; details?: unknown; message?: string }
  | string
  | null
  | undefined;

function extractApiErrorMessage(payload: unknown): string | null {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (payload && typeof payload === "object") {
    const p = payload as Extract<ApiErrorLike, object>;
    if (typeof p.error === "string" && p.error.trim()) return p.error;
    if (typeof p.message === "string" && p.message.trim()) return p.message;
  }
  return null;
}

export interface FileUploadState {
  /** Whether an upload is currently in progress */
  isUploading: boolean;
  /** Upload progress percentage (0-100) */
  progress: number;
  /** Error message if the upload failed */
  error: string | null;
}

export interface FileUploadOptions {
  /** Called when the upload completes successfully */
  onSuccess?: (response: unknown) => void;
  /** Called when the upload fails */
  onError?: (error: string) => void;
  /** Called when upload progress changes */
  onProgress?: (progress: number) => void;
  /** Additional headers to send with the request */
  headers?: Record<string, string>;
}

export interface FileUploadResult extends FileUploadState {
  /**
   * Upload a FormData payload to the given URL with real progress tracking.
   * Uses XMLHttpRequest internally to access upload.onprogress events.
   */
  upload: (url: string, formData: FormData) => Promise<unknown>;
  /** Cancel the current upload */
  cancel: () => void;
  /** Reset the upload state */
  reset: () => void;
}

/**
 * Hook for file uploads with real progress tracking via XMLHttpRequest.
 *
 * Usage:
 * ```tsx
 * const { upload, isUploading, progress, error, cancel } = useFileUpload({
 *   onSuccess: (data) => { ... },
 *   onError: (msg) => toast.error(msg),
 * });
 *
 * // In your submit handler:
 * const formData = new FormData();
 * formData.append("file", file);
 * await upload("/api/documents", formData);
 * ```
 */
export function useFileUpload(options: FileUploadOptions = {}): FileUploadResult {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const optionsRef = useRef(options);

  // Keep optionsRef in sync with the latest options without triggering re-renders
  useEffect(() => {
    optionsRef.current = options;
  });

  const upload = useCallback(
    (url: string, formData: FormData): Promise<unknown> => {
      return new Promise((resolve, reject) => {
        setIsUploading(true);
        setProgress(0);
        setError(null);

        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        // Track upload progress
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            setProgress(percent);
            optionsRef.current.onProgress?.(percent);
          }
        });

        xhr.addEventListener("load", () => {
          xhrRef.current = null;

          const contentType = xhr.getResponseHeader("content-type") ?? "";
          let responseData: unknown;
          if (contentType.includes("application/json")) {
            try {
              responseData = JSON.parse(xhr.responseText);
            } catch {
              // Server claimed JSON but sent something else — fall back to a
              // generic error rather than leaking the raw body into a toast.
              responseData = {
                error: `Ungültige Server-Antwort (Status ${xhr.status})`,
              };
            }
          } else {
            // Non-JSON (e.g. HTML error page from reverse proxy on 502/503).
            // Don't put the HTML into the toast — surface a clean status.
            responseData = {
              error: `Server-Fehler (Status ${xhr.status})`,
            };
          }

          if (xhr.status >= 200 && xhr.status < 300) {
            setProgress(100);
            setIsUploading(false);
            optionsRef.current.onSuccess?.(responseData);
            resolve(responseData);
          } else {
            const errorMsg =
              extractApiErrorMessage(responseData) ||
              `Upload fehlgeschlagen (Status ${xhr.status})`;
            setError(errorMsg);
            setIsUploading(false);
            optionsRef.current.onError?.(errorMsg);
            reject(new Error(errorMsg));
          }
        });

        xhr.addEventListener("error", () => {
          xhrRef.current = null;
          const errorMsg = "Netzwerkfehler beim Hochladen";
          setError(errorMsg);
          setIsUploading(false);
          optionsRef.current.onError?.(errorMsg);
          reject(new Error(errorMsg));
        });

        xhr.addEventListener("abort", () => {
          xhrRef.current = null;
          const errorMsg = "Upload abgebrochen";
          setError(errorMsg);
          setIsUploading(false);
          optionsRef.current.onError?.(errorMsg);
          reject(new Error(errorMsg));
        });

        xhr.open("POST", url);

        // Set any additional headers (but NOT Content-Type -- browser sets it for FormData)
        if (optionsRef.current.headers) {
          Object.entries(optionsRef.current.headers).forEach(([key, value]) => {
            xhr.setRequestHeader(key, value);
          });
        }

        xhr.send(formData);
      });
    },
    []
  );

  const cancel = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    setIsUploading(false);
    setProgress(0);
    setError(null);
  }, []);

  return {
    isUploading,
    progress,
    error,
    upload,
    cancel,
    reset,
  };
}
