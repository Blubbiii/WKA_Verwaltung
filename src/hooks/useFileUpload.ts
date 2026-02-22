"use client";

import { useState, useCallback, useRef } from "react";

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
  optionsRef.current = options;

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

          let responseData: unknown;
          try {
            responseData = JSON.parse(xhr.responseText);
          } catch {
            responseData = xhr.responseText;
          }

          if (xhr.status >= 200 && xhr.status < 300) {
            setProgress(100);
            setIsUploading(false);
            optionsRef.current.onSuccess?.(responseData);
            resolve(responseData);
          } else {
            const errorMsg =
              (responseData as { error?: string })?.error ||
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
