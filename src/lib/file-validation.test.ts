import { describe, it, expect } from "vitest";
import { validateFileContent } from "./file-validation";
import type { FileValidationResult } from "./file-validation";

// =============================================================================
// Helper: create a Buffer from byte array
// =============================================================================

function bufferFrom(bytes: number[]): Buffer {
  return Buffer.from(bytes);
}

// Magic number constants for readability
const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]; // %PDF-1.4
const PNG_HEADER = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]; // PNG signature
const JPEG_HEADER = [0xFF, 0xD8, 0xFF, 0xE0]; // JPEG/JFIF
const GIF87_HEADER = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]; // GIF87a
const GIF89_HEADER = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]; // GIF89a
const ZIP_HEADER = [0x50, 0x4B, 0x03, 0x04]; // PK (ZIP)
const OLE2_HEADER = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]; // OLE2
const EXE_HEADER = [0x4D, 0x5A]; // MZ (Windows executable)
const WEBP_HEADER = [
  0x52, 0x49, 0x46, 0x46, // RIFF
  0x00, 0x00, 0x00, 0x00, // file size (placeholder)
  0x57, 0x45, 0x42, 0x50, // WEBP
];

// =============================================================================
// Leere Dateien
// =============================================================================

describe("validateFileContent - leere Dateien", () => {
  it("lehnt leere Dateien ab", () => {
    const result = validateFileContent(Buffer.alloc(0), "application/pdf");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("leer");
  });
});

// =============================================================================
// PDF Validation
// =============================================================================

describe("validateFileContent - PDF", () => {
  it("akzeptiert gueltige PDF-Dateien", () => {
    const buffer = bufferFrom(PDF_HEADER);
    const result = validateFileContent(buffer, "application/pdf");
    expect(result.valid).toBe(true);
  });

  it("lehnt Dateien ab die kein PDF sind aber als PDF deklariert werden", () => {
    const buffer = bufferFrom(PNG_HEADER);
    const result = validateFileContent(buffer, "application/pdf");
    expect(result.valid).toBe(false);
    expect(result.detectedType).toBe("image/png");
  });

  it("lehnt EXE-Dateien ab die als PDF getarnt sind", () => {
    const buffer = bufferFrom([...EXE_HEADER, 0x00, 0x00, 0x00, 0x00]);
    const result = validateFileContent(buffer, "application/pdf");
    expect(result.valid).toBe(false);
    expect(result.detectedType).toContain("Executable");
  });
});

// =============================================================================
// PNG Validation
// =============================================================================

describe("validateFileContent - PNG", () => {
  it("akzeptiert gueltige PNG-Dateien", () => {
    const buffer = bufferFrom(PNG_HEADER);
    const result = validateFileContent(buffer, "image/png");
    expect(result.valid).toBe(true);
  });

  it("lehnt JPEG als PNG ab", () => {
    const buffer = bufferFrom(JPEG_HEADER);
    const result = validateFileContent(buffer, "image/png");
    expect(result.valid).toBe(false);
    expect(result.detectedType).toBe("image/jpeg");
  });
});

// =============================================================================
// JPEG Validation
// =============================================================================

describe("validateFileContent - JPEG", () => {
  it("akzeptiert gueltige JPEG-Dateien", () => {
    const buffer = bufferFrom(JPEG_HEADER);
    const result = validateFileContent(buffer, "image/jpeg");
    expect(result.valid).toBe(true);
  });

  it("lehnt PDF als JPEG ab", () => {
    const buffer = bufferFrom(PDF_HEADER);
    const result = validateFileContent(buffer, "image/jpeg");
    expect(result.valid).toBe(false);
  });
});

// =============================================================================
// GIF Validation
// =============================================================================

describe("validateFileContent - GIF", () => {
  it("akzeptiert GIF87a Format", () => {
    const buffer = bufferFrom(GIF87_HEADER);
    const result = validateFileContent(buffer, "image/gif");
    expect(result.valid).toBe(true);
  });

  it("akzeptiert GIF89a Format", () => {
    const buffer = bufferFrom(GIF89_HEADER);
    const result = validateFileContent(buffer, "image/gif");
    expect(result.valid).toBe(true);
  });
});

// =============================================================================
// WebP Validation
// =============================================================================

describe("validateFileContent - WebP", () => {
  it("akzeptiert gueltige WebP-Dateien (RIFF + WEBP Marker)", () => {
    const buffer = bufferFrom(WEBP_HEADER);
    const result = validateFileContent(buffer, "image/webp");
    expect(result.valid).toBe(true);
  });

  it("lehnt RIFF ohne WEBP Marker ab", () => {
    const riffNonWebp = [
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00,
      0x41, 0x56, 0x49, 0x20, // AVI instead of WEBP
    ];
    const buffer = bufferFrom(riffNonWebp);
    const result = validateFileContent(buffer, "image/webp");
    expect(result.valid).toBe(false);
  });

  it("lehnt zu kurze RIFF-Header ab", () => {
    // Only 4 bytes (RIFF) but needs 12 for WEBP validation
    const buffer = bufferFrom([0x52, 0x49, 0x46, 0x46]);
    const result = validateFileContent(buffer, "image/webp");
    expect(result.valid).toBe(false);
  });
});

// =============================================================================
// ZIP-based Office Documents (docx, xlsx, pptx)
// =============================================================================

describe("validateFileContent - Office ZIP-Dokumente", () => {
  const officeTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];

  for (const mimeType of officeTypes) {
    it(`akzeptiert ZIP-Signatur fuer ${mimeType.split(".").pop()}`, () => {
      const buffer = bufferFrom([...ZIP_HEADER, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      const result = validateFileContent(buffer, mimeType);
      expect(result.valid).toBe(true);
    });

    it(`lehnt nicht-ZIP-Dateien als ${mimeType.split(".").pop()} ab`, () => {
      const buffer = bufferFrom(PDF_HEADER);
      const result = validateFileContent(buffer, mimeType);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("ZIP/PK-Signatur");
    });
  }
});

// =============================================================================
// Legacy OLE2 Office Documents (doc, xls, ppt)
// =============================================================================

describe("validateFileContent - Legacy Office-Dokumente (OLE2)", () => {
  const legacyTypes = [
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.ms-powerpoint",
  ];

  for (const mimeType of legacyTypes) {
    it(`akzeptiert OLE2-Signatur fuer ${mimeType}`, () => {
      const buffer = bufferFrom([...OLE2_HEADER, 0x00, 0x00, 0x00, 0x00]);
      const result = validateFileContent(buffer, mimeType);
      expect(result.valid).toBe(true);
    });

    it(`lehnt nicht-OLE2-Dateien als ${mimeType} ab`, () => {
      const buffer = bufferFrom(PNG_HEADER);
      const result = validateFileContent(buffer, mimeType);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("OLE2-Signatur");
    });
  }
});

// =============================================================================
// SVG Validation
// =============================================================================

describe("validateFileContent - SVG", () => {
  it("akzeptiert SVG das mit <svg beginnt", () => {
    const buffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const result = validateFileContent(buffer, "image/svg+xml");
    expect(result.valid).toBe(true);
  });

  it("akzeptiert SVG das mit <?xml beginnt", () => {
    const buffer = Buffer.from('<?xml version="1.0"?><svg></svg>');
    const result = validateFileContent(buffer, "image/svg+xml");
    expect(result.valid).toBe(true);
  });

  it("akzeptiert SVG mit fuehrendem Whitespace", () => {
    const buffer = Buffer.from('  \n  <svg></svg>');
    const result = validateFileContent(buffer, "image/svg+xml");
    expect(result.valid).toBe(true);
  });

  it("lehnt binaere Dateien als SVG ab", () => {
    const buffer = bufferFrom(PNG_HEADER);
    const result = validateFileContent(buffer, "image/svg+xml");
    expect(result.valid).toBe(false);
  });
});

// =============================================================================
// Text-based Formats (text/plain, text/csv)
// =============================================================================

describe("validateFileContent - Textdateien", () => {
  it("akzeptiert gueltige Textdateien", () => {
    const buffer = Buffer.from("Hello World\nLine 2\nLine 3");
    const result = validateFileContent(buffer, "text/plain");
    expect(result.valid).toBe(true);
  });

  it("akzeptiert CSV-Dateien", () => {
    const buffer = Buffer.from("Name,Alter,Stadt\nAnna,30,Berlin\nMax,25,Hamburg");
    const result = validateFileContent(buffer, "text/csv");
    expect(result.valid).toBe(true);
  });

  it("akzeptiert Dateien mit Tabs und Zeilenumbruechen", () => {
    const buffer = Buffer.from("Col1\tCol2\tCol3\r\nVal1\tVal2\tVal3");
    const result = validateFileContent(buffer, "text/plain");
    expect(result.valid).toBe(true);
  });

  it("lehnt binaere Inhalte als Text ab", () => {
    const buffer = bufferFrom([0x00, 0x01, 0x02, 0x03, 0x04]);
    const result = validateFileContent(buffer, "text/plain");
    expect(result.valid).toBe(false);
    expect(result.detectedType).toBe("binary");
  });

  it("akzeptiert UTF-8 BOM am Anfang", () => {
    const bom = [0xEF, 0xBB, 0xBF];
    const text = Buffer.from("Hello");
    const buffer = Buffer.concat([Buffer.from(bom), text]);
    const result = validateFileContent(buffer, "text/plain");
    expect(result.valid).toBe(true);
  });
});

// =============================================================================
// Unbekannte MIME-Types
// =============================================================================

describe("validateFileContent - unbekannte MIME-Types", () => {
  it("weist unbekannte MIME-Types ab (Security)", () => {
    const buffer = bufferFrom([0x00, 0x01, 0x02, 0x03]);
    const result = validateFileContent(buffer, "application/octet-stream");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Nicht unterstuetzter Dateityp");
  });

  it("weist benutzerdefinierte MIME-Types ab (Security)", () => {
    const buffer = bufferFrom([0x00, 0x01, 0x02, 0x03]);
    const result = validateFileContent(buffer, "application/x-custom-format");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Nicht unterstuetzter Dateityp");
  });
});

// =============================================================================
// Security: Erkennung von getarnten Dateien
// =============================================================================

describe("validateFileContent - Sicherheit", () => {
  it("erkennt EXE getarnt als PDF", () => {
    const buffer = bufferFrom([...EXE_HEADER, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const result = validateFileContent(buffer, "application/pdf");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("manipuliert");
  });

  it("erkennt PNG getarnt als JPEG", () => {
    const buffer = bufferFrom(PNG_HEADER);
    const result = validateFileContent(buffer, "image/jpeg");
    expect(result.valid).toBe(false);
    expect(result.detectedType).toBe("image/png");
  });

  it("erkennt ZIP getarnt als PDF", () => {
    const buffer = bufferFrom([...ZIP_HEADER, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const result = validateFileContent(buffer, "application/pdf");
    expect(result.valid).toBe(false);
    expect(result.detectedType).toBe("application/zip");
  });

  it("meldet unbekannten Typ wenn Signatur nicht erkannt wird", () => {
    const buffer = bufferFrom([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
    const result = validateFileContent(buffer, "application/pdf");
    expect(result.valid).toBe(false);
    // detectedType may be undefined for truly unknown signatures
  });
});
