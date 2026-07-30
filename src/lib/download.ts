/**
 * Antwort eines Export-Endpunkts als Datei speichern.
 *
 * Das Muster (blob → ObjectURL → unsichtbarer <a> → revoke) stand bisher an
 * 16 Stellen kopiert im Code, teils ohne `revokeObjectURL` und mit einer
 * eigenen, unvollständigen Filename-Extraktion. Hier gebündelt, aufbauend auf
 * dem vorhandenen `extractFilename` (das auch RFC-6266-Umlaute korrekt löst).
 *
 * Bewusst kein React-Hook: die Funktion wird in Event-Handlern aufgerufen.
 */

import { extractFilename } from "./download-filename";

/**
 * Lädt den Body der Response als Datei herunter.
 *
 * @param response bereits geprüfte (res.ok) Antwort
 * @param fallbackFilename genutzt, wenn die Antwort keinen Content-Disposition
 *        mit Dateinamen trägt
 */
export async function downloadFromResponse(
  response: Response,
  fallbackFilename: string,
): Promise<void> {
  const blob = await response.blob();
  const filename =
    extractFilename(response.headers.get("Content-Disposition")) ?? fallbackFilename;

  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    // Ohne das Anhängen an das Dokument ignorieren einige Browser den Klick.
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Immer freigeben — sonst hält der Blob den Speicher bis zum Reload.
    URL.revokeObjectURL(url);
  }
}

/** Beliebigen Text als Datei herunterladen (z. B. generiertes Markdown). */
export function downloadText(
  content: string,
  filename: string,
  mimeType = "text/plain;charset=utf-8",
): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
