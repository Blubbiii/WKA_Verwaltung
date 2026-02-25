/**
 * Paperless-ngx API Types
 *
 * TypeScript interfaces for Paperless-ngx REST API v2.x responses.
 */

// =============================================================================
// Pagination
// =============================================================================

export interface PaperlessPaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// =============================================================================
// Documents
// =============================================================================

export interface PaperlessDocument {
  id: number;
  correspondent: number | null;
  document_type: number | null;
  storage_path: number | null;
  title: string;
  content: string;
  tags: number[];
  created: string;
  created_date: string;
  modified: string;
  added: string;
  archive_serial_number: number | null;
  original_file_name: string;
  archived_file_name: string | null;
  owner: number | null;
  notes: PaperlessNote[];
  custom_fields: PaperlessCustomFieldValue[];
}

export interface PaperlessNote {
  id: number;
  note: string;
  created: string;
  user: number;
}

export interface PaperlessCustomFieldValue {
  field: number;
  value: string | number | boolean | null;
}

export type PaperlessDocumentList = PaperlessPaginatedResponse<PaperlessDocument>;

// =============================================================================
// Metadata
// =============================================================================

export interface PaperlessTag {
  id: number;
  slug: string;
  name: string;
  colour: number;
  match: string;
  matching_algorithm: number;
  is_insensitive: boolean;
  document_count: number;
  owner: number | null;
}

export interface PaperlessDocumentType {
  id: number;
  slug: string;
  name: string;
  match: string;
  matching_algorithm: number;
  is_insensitive: boolean;
  document_count: number;
  owner: number | null;
}

export interface PaperlessCorrespondent {
  id: number;
  slug: string;
  name: string;
  match: string;
  matching_algorithm: number;
  is_insensitive: boolean;
  document_count: number;
  owner: number | null;
}

// =============================================================================
// Upload
// =============================================================================

export interface PaperlessUploadOptions {
  title: string;
  filename: string;
  correspondent?: number;
  documentType?: number;
  tags?: number[];
}

// =============================================================================
// Connection Test
// =============================================================================

export interface PaperlessConnectionResult {
  success: boolean;
  version?: string;
  documentCount?: number;
  error?: string;
}
