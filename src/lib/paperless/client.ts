/**
 * Paperless-ngx API Client
 *
 * HTTP client for the Paperless-ngx REST API.
 * Handles authentication, uploads, search, and metadata retrieval.
 */

import { logger } from "@/lib/logger";
import type {
  PaperlessDocument,
  PaperlessDocumentList,
  PaperlessTag,
  PaperlessDocumentType,
  PaperlessCorrespondent,
  PaperlessPaginatedResponse,
  PaperlessUploadOptions,
  PaperlessConnectionResult,
} from "./types";

// =============================================================================
// Client
// =============================================================================

export class PaperlessClient {
  private baseUrl: string;
  private token: string;

  constructor(url: string, token: string) {
    this.baseUrl = url.replace(/\/+$/, "");
    this.token = token;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private headers(): Record<string, string> {
    return {
      Authorization: `Token ${this.token}`,
    };
  }

  private jsonHeaders(): Record<string, string> {
    return {
      ...this.headers(),
      "Content-Type": "application/json",
    };
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    timeoutMs = 5000
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          ...this.headers(),
          ...(options.headers || {}),
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new PaperlessApiError(
          `HTTP ${response.status}: ${body.substring(0, 200)}`,
          response.status
        );
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestStream(
    path: string,
    timeoutMs = 10000
  ): Promise<{ stream: ReadableStream; contentType: string; contentLength: string | null }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        headers: this.headers(),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new PaperlessApiError(
          `HTTP ${response.status}`,
          response.status
        );
      }

      if (!response.body) {
        throw new PaperlessApiError("No response body", 500);
      }

      return {
        stream: response.body,
        contentType: response.headers.get("content-type") || "application/octet-stream",
        contentLength: response.headers.get("content-length"),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  // ---------------------------------------------------------------------------
  // Connection Test
  // ---------------------------------------------------------------------------

  async testConnection(): Promise<PaperlessConnectionResult> {
    try {
      // Fetch document list with page_size=1 to verify auth + get count
      const result = await this.request<PaperlessDocumentList>(
        "/api/documents/?page_size=1",
        {},
        10000 // 10s — Docker container networking can be slow
      );

      return {
        success: true,
        documentCount: result.count,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error({ err: error }, "[Paperless] Connection test failed");
      return {
        success: false,
        error: message,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Documents
  // ---------------------------------------------------------------------------

  async uploadDocument(
    file: Buffer,
    options: PaperlessUploadOptions
  ): Promise<string> {
    const formData = new FormData();
    formData.append("document", new Blob([new Uint8Array(file)]), options.filename);
    formData.append("title", options.title);

    if (options.correspondent) {
      formData.append("correspondent", String(options.correspondent));
    }
    if (options.documentType) {
      formData.append("document_type", String(options.documentType));
    }
    if (options.tags?.length) {
      for (const tag of options.tags) {
        formData.append("tags", String(tag));
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s for uploads

    try {
      const response = await fetch(
        `${this.baseUrl}/api/documents/post_document/`,
        {
          method: "POST",
          headers: this.headers(),
          body: formData,
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new PaperlessApiError(
          `Upload failed: HTTP ${response.status}: ${body.substring(0, 200)}`,
          response.status
        );
      }

      // Paperless returns a task ID as plain text
      const taskId = await response.text();
      return taskId.replace(/"/g, "").trim();
    } finally {
      clearTimeout(timeout);
    }
  }

  async listDocuments(params?: {
    query?: string;
    page?: number;
    pageSize?: number;
    ordering?: string;
    tags?: number[];
    documentType?: number;
    correspondent?: number;
  }): Promise<PaperlessDocumentList> {
    const searchParams = new URLSearchParams();

    if (params?.query) searchParams.set("query", params.query);
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.pageSize) searchParams.set("page_size", String(params.pageSize));
    if (params?.ordering) searchParams.set("ordering", params.ordering);
    if (params?.documentType) searchParams.set("document_type__id", String(params.documentType));
    if (params?.correspondent) searchParams.set("correspondent__id", String(params.correspondent));
    if (params?.tags?.length) {
      searchParams.set("tags__id__all", params.tags.join(","));
    }

    const qs = searchParams.toString();
    return this.request<PaperlessDocumentList>(
      `/api/documents/${qs ? `?${qs}` : ""}`
    );
  }

  async getDocument(id: number): Promise<PaperlessDocument> {
    return this.request<PaperlessDocument>(`/api/documents/${id}/`);
  }

  async downloadDocument(id: number): Promise<{
    stream: ReadableStream;
    contentType: string;
    contentLength: string | null;
  }> {
    return this.requestStream(`/api/documents/${id}/download/`, 30000);
  }

  async getPreview(id: number): Promise<{
    stream: ReadableStream;
    contentType: string;
    contentLength: string | null;
  }> {
    return this.requestStream(`/api/documents/${id}/preview/`);
  }

  // ---------------------------------------------------------------------------
  // Metadata
  // ---------------------------------------------------------------------------

  async getTags(): Promise<PaperlessTag[]> {
    const result = await this.request<PaperlessPaginatedResponse<PaperlessTag>>(
      "/api/tags/?page_size=1000"
    );
    return result.results;
  }

  async getDocumentTypes(): Promise<PaperlessDocumentType[]> {
    const result = await this.request<PaperlessPaginatedResponse<PaperlessDocumentType>>(
      "/api/document_types/?page_size=1000"
    );
    return result.results;
  }

  async getCorrespondents(): Promise<PaperlessCorrespondent[]> {
    const result = await this.request<PaperlessPaginatedResponse<PaperlessCorrespondent>>(
      "/api/correspondents/?page_size=1000"
    );
    return result.results;
  }
}

// =============================================================================
// Error
// =============================================================================

export class PaperlessApiError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "PaperlessApiError";
  }
}
