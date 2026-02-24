/**
 * PDF-Merge Utility: Legt Content-PDF über ein Briefpapier-Hintergrund-PDF.
 * Nutzt pdf-lib für verlustfreies Vektor-Merging.
 */

import { PDFDocument } from "pdf-lib";
import { getFileBuffer } from "@/lib/storage";

/**
 * Merged ein Content-PDF auf ein Briefpapier-Hintergrund-PDF.
 *
 * Das Briefpapier-PDF kann 1-2 Seiten haben:
 * - Seite 1: Hintergrund für die erste Content-Seite
 * - Seite 2 (optional): Hintergrund für alle Folgeseiten
 * - Nur 1 Seite: Wird für ALLE Content-Seiten verwendet
 *
 * @param contentBuffer - Content-PDF (von @react-pdf/renderer)
 * @param letterheadPdfKey - S3-Key des Briefpapier-PDFs
 * @returns Merged PDF Buffer
 */
export async function mergeWithLetterhead(
  contentBuffer: Buffer | Uint8Array,
  letterheadPdfKey: string
): Promise<Buffer> {
  // 1. Briefpapier-PDF aus S3 laden
  const letterheadBuffer = await getFileBuffer(letterheadPdfKey);

  // 2. Beide PDFs laden
  const letterheadDoc = await PDFDocument.load(letterheadBuffer);
  const contentDoc = await PDFDocument.load(contentBuffer);

  // 3. Output-Dokument erstellen
  const mergedDoc = await PDFDocument.create();

  const contentPageCount = contentDoc.getPageCount();
  const letterheadPageCount = letterheadDoc.getPageCount();

  for (let i = 0; i < contentPageCount; i++) {
    // Briefpapier-Seite waehlen:
    // Seite 0 für erste Content-Seite, Seite 1 für Folgeseiten (Fallback: Seite 0)
    const letterheadPageIndex = i === 0 ? 0 : Math.min(1, letterheadPageCount - 1);

    // Seiten einbetten
    const [embeddedLetterhead] = await mergedDoc.embedPages(
      [letterheadDoc.getPage(letterheadPageIndex)]
    );
    const [embeddedContent] = await mergedDoc.embedPages(
      [contentDoc.getPage(i)]
    );

    // Dimensionen vom Briefpapier (die "Leinwand")
    const { width, height } = letterheadDoc.getPage(letterheadPageIndex).getSize();

    // Neue Seite mit Briefpapier-Dimensionen
    const page = mergedDoc.addPage([width, height]);

    // Briefpapier ZUERST zeichnen (Hintergrund-Ebene)
    page.drawPage(embeddedLetterhead, {
      x: 0,
      y: 0,
      width,
      height,
    });

    // Content DARUEBER zeichnen (Vordergrund-Ebene)
    page.drawPage(embeddedContent, {
      x: 0,
      y: 0,
      width,
      height,
    });
  }

  // 4. Serialisieren und zurückgeben
  const mergedBytes = await mergedDoc.save();
  return Buffer.from(mergedBytes);
}
