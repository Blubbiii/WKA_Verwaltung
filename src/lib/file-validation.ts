/**
 * File Content Validation via Magic Number Checking
 *
 * Validates that the actual binary content of uploaded files matches
 * the declared MIME type. This prevents attackers from spoofing the
 * Content-Type header to upload malicious files (e.g., an .exe
 * disguised as a .pdf).
 *
 * Magic numbers are specific byte sequences at the beginning of a file
 * that identify the file format regardless of the file extension or
 * declared MIME type.
 */

// Magic number signatures for common file types
const FILE_SIGNATURES: { mimeType: string; signatures: number[][] }[] = [
  // PDF: %PDF
  { mimeType: 'application/pdf', signatures: [[0x25, 0x50, 0x44, 0x46]] },
  // PNG: 89 50 4E 47
  { mimeType: 'image/png', signatures: [[0x89, 0x50, 0x4E, 0x47]] },
  // JPEG: FF D8 FF
  { mimeType: 'image/jpeg', signatures: [[0xFF, 0xD8, 0xFF]] },
  // GIF: GIF87a or GIF89a
  {
    mimeType: 'image/gif',
    signatures: [
      [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
      [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
    ],
  },
  // WebP: RIFF....WEBP (check RIFF header, then verify WEBP at offset 8)
  { mimeType: 'image/webp', signatures: [[0x52, 0x49, 0x46, 0x46]] },
  // ZIP-based (docx, xlsx, pptx): PK signature
  { mimeType: 'application/zip', signatures: [[0x50, 0x4B, 0x03, 0x04]] },
  // SVG: starts with < (XML-based)
  { mimeType: 'image/svg+xml', signatures: [[0x3C]] },
  // Text-based formats: skip magic number check, validate printable ASCII instead
  { mimeType: 'text/plain', signatures: [] },
  { mimeType: 'text/csv', signatures: [] },
];

// Office document MIME types that use ZIP container format (PK signature)
const ZIP_BASED_TYPES = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
];

// Legacy Office formats that use OLE2 compound document format
const OLE2_BASED_TYPES = [
  'application/msword', // .doc
  'application/vnd.ms-excel', // .xls
  'application/vnd.ms-powerpoint', // .ppt
];

// OLE2 magic number: D0 CF 11 E0 A1 B1 1A E1
const OLE2_SIGNATURE = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];

/**
 * Checks if a byte sequence in the buffer matches a given signature
 * starting at offset 0.
 */
function matchesSignature(header: Uint8Array, signature: number[]): boolean {
  if (header.length < signature.length) {
    return false;
  }
  for (let i = 0; i < signature.length; i++) {
    if (header[i] !== signature[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Checks if the first N bytes of the buffer are printable ASCII characters.
 * Printable ASCII includes: tab (0x09), newline (0x0A), carriage return (0x0D),
 * and characters 0x20-0x7E. Also allows BOM (0xEF, 0xBB, 0xBF for UTF-8).
 */
function isPrintableAscii(buffer: Buffer, checkLength: number): boolean {
  const length = Math.min(buffer.length, checkLength);
  for (let i = 0; i < length; i++) {
    const byte = buffer[i];
    // Allow: tab, newline, carriage return, printable ASCII range,
    // and UTF-8 BOM bytes
    const isAllowed =
      byte === 0x09 || // tab
      byte === 0x0A || // newline (LF)
      byte === 0x0D || // carriage return (CR)
      (byte >= 0x20 && byte <= 0x7E) || // printable ASCII
      byte === 0xEF || byte === 0xBB || byte === 0xBF; // UTF-8 BOM

    if (!isAllowed) {
      return false;
    }
  }
  return true;
}

export interface FileValidationResult {
  valid: boolean;
  detectedType?: string;
  reason?: string;
}

/**
 * Validates that the binary content of a file matches its declared MIME type
 * by checking magic number signatures in the file header.
 *
 * @param buffer - The file content as a Buffer
 * @param declaredMimeType - The MIME type declared by the client (from Content-Type or file.type)
 * @returns Validation result with valid flag, optionally detected type and reason for rejection
 */
export function validateFileContent(
  buffer: Buffer,
  declaredMimeType: string
): FileValidationResult {
  // Empty files are invalid
  if (buffer.length === 0) {
    return { valid: false, reason: 'Datei ist leer' };
  }

  // Handle ZIP-based Office documents (docx, xlsx, pptx)
  // These use PK (ZIP) container format
  if (ZIP_BASED_TYPES.includes(declaredMimeType)) {
    const header = new Uint8Array(buffer.slice(0, 12));
    const zipSignature = [0x50, 0x4B, 0x03, 0x04];
    if (matchesSignature(header, zipSignature)) {
      return { valid: true };
    }
    return {
      valid: false,
      detectedType: 'unknown',
      reason: `Dateiinhalt stimmt nicht mit dem deklarierten Typ "${declaredMimeType}" überein. Erwartet: ZIP/PK-Signatur für Office-Dokument.`,
    };
  }

  // Handle legacy OLE2-based Office documents (doc, xls, ppt)
  if (OLE2_BASED_TYPES.includes(declaredMimeType)) {
    const header = new Uint8Array(buffer.slice(0, 12));
    if (matchesSignature(header, OLE2_SIGNATURE)) {
      return { valid: true };
    }
    return {
      valid: false,
      detectedType: 'unknown',
      reason: `Dateiinhalt stimmt nicht mit dem deklarierten Typ "${declaredMimeType}" überein. Erwartet: OLE2-Signatur für Office-Dokument.`,
    };
  }

  // Find the signature entry for the declared MIME type
  const signatureEntry = FILE_SIGNATURES.find(
    (entry) => entry.mimeType === declaredMimeType
  );

  // If we don't have a signature for this MIME type, reject it
  // Unknown/unsupported MIME types are not allowed for security reasons
  if (!signatureEntry) {
    return {
      valid: false,
      detectedType: 'unknown',
      reason: `Nicht unterstuetzter Dateityp: "${declaredMimeType}". Erlaubte Typen: PDF, PNG, JPEG, GIF, WebP, SVG, Office-Dokumente, Text, CSV.`,
    };
  }

  // Text-based formats: no magic number, check for printable ASCII instead
  if (signatureEntry.signatures.length === 0) {
    if (isPrintableAscii(buffer, 100)) {
      return { valid: true };
    }
    return {
      valid: false,
      detectedType: 'binary',
      reason: `Dateiinhalt stimmt nicht mit dem deklarierten Typ "${declaredMimeType}" überein. Die Datei enthaelt nicht-druckbare Zeichen und ist keine gültige Textdatei.`,
    };
  }

  // Read the first 12 bytes for signature matching
  const header = new Uint8Array(buffer.slice(0, 12));

  // Special handling for SVG: check for '<' or '<?xml' (with optional whitespace/BOM)
  if (declaredMimeType === 'image/svg+xml') {
    // SVGs can start with BOM, whitespace, '<svg', or '<?xml'
    const firstChars = buffer.slice(0, 100).toString('utf-8').trimStart();
    if (firstChars.startsWith('<')) {
      return { valid: true };
    }
    return {
      valid: false,
      detectedType: 'unknown',
      reason: `Dateiinhalt stimmt nicht mit dem deklarierten Typ "image/svg+xml" überein. Erwartet: XML-Inhalt beginnend mit "<".`,
    };
  }

  // Special handling for WebP: must have RIFF header AND "WEBP" at bytes 8-11
  if (declaredMimeType === 'image/webp') {
    const riffSignature = [0x52, 0x49, 0x46, 0x46];
    if (matchesSignature(header, riffSignature) && header.length >= 12) {
      const webpMarker = [0x57, 0x45, 0x42, 0x50]; // "WEBP"
      const markerSlice = header.slice(8, 12);
      if (matchesSignature(markerSlice, webpMarker)) {
        return { valid: true };
      }
    }
    return {
      valid: false,
      detectedType: 'unknown',
      reason: `Dateiinhalt stimmt nicht mit dem deklarierten Typ "image/webp" überein. Erwartet: RIFF/WEBP-Signatur.`,
    };
  }

  // Standard signature matching: check if any signature matches
  for (const signature of signatureEntry.signatures) {
    if (matchesSignature(header, signature)) {
      return { valid: true };
    }
  }

  // No signature matched -- try to detect what the file actually is
  const detectedType = detectFileType(header);

  return {
    valid: false,
    detectedType,
    reason: `Dateiinhalt stimmt nicht mit dem deklarierten Typ "${declaredMimeType}" überein.${detectedType ? ` Erkannter Typ: ${detectedType}.` : ''} Die Datei könnte manipuliert sein.`,
  };
}

/**
 * Attempts to detect the actual file type from its magic number.
 * Returns a human-readable type string or undefined if unknown.
 */
function detectFileType(header: Uint8Array): string | undefined {
  // Check known signatures
  if (matchesSignature(header, [0x25, 0x50, 0x44, 0x46])) return 'application/pdf';
  if (matchesSignature(header, [0x89, 0x50, 0x4E, 0x47])) return 'image/png';
  if (matchesSignature(header, [0xFF, 0xD8, 0xFF])) return 'image/jpeg';
  if (matchesSignature(header, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (matchesSignature(header, [0x50, 0x4B, 0x03, 0x04])) return 'application/zip';
  if (matchesSignature(header, [0x52, 0x49, 0x46, 0x46])) return 'RIFF-container (WebP/AVI/WAV)';
  if (matchesSignature(header, [0xD0, 0xCF, 0x11, 0xE0])) return 'OLE2 (legacy Office)';
  // PE executable (EXE/DLL): MZ header
  if (matchesSignature(header, [0x4D, 0x5A])) return 'Windows Executable (EXE/DLL)';
  // ELF executable
  if (matchesSignature(header, [0x7F, 0x45, 0x4C, 0x46])) return 'Linux Executable (ELF)';

  return undefined;
}
