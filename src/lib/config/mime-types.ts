/**
 * Zentrale MIME-Type-Konstanten + häufige Kombinationen.
 * Verwendung in <input accept="..."> oder MIME-Whitelist-Checks.
 */
export const MIME_TYPES = {
  PDF: "application/pdf",
  JPEG: "image/jpeg",
  PNG: "image/png",
  WEBP: "image/webp",
  TIFF: "image/tiff",
  SVG: "image/svg+xml",
  WORD_DOC: "application/msword",
  WORD_DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  EXCEL_XLS: "application/vnd.ms-excel",
  EXCEL_XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  CSV: "text/csv",
  MP4: "video/mp4",
  WEBM: "video/webm",
} as const;

/** Häufige Kombinations-Strings für <input accept="..."> */
export const ACCEPT = {
  PDF_ONLY: MIME_TYPES.PDF,
  IMAGES: [MIME_TYPES.JPEG, MIME_TYPES.PNG, MIME_TYPES.WEBP].join(","),
  IMAGES_WITH_TIFF: [MIME_TYPES.JPEG, MIME_TYPES.PNG, MIME_TYPES.WEBP, MIME_TYPES.TIFF].join(","),
  DOCUMENTS: [MIME_TYPES.PDF, MIME_TYPES.WORD_DOC, MIME_TYPES.WORD_DOCX].join(","),
  PDF_AND_IMAGES: [MIME_TYPES.PDF, MIME_TYPES.JPEG, MIME_TYPES.PNG, MIME_TYPES.TIFF, MIME_TYPES.WEBP].join(","),
  VIDEO: [MIME_TYPES.MP4, MIME_TYPES.WEBM].join(","),
} as const;
