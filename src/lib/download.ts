/**
 * Datei-Downloads im Browser.
 *
 * Das Muster (ObjectURL → unsichtbarer <a> → click → revoke) stand an 49
 * Stellen in 44 Dateien kopiert im Code, jede mit eigener Filename-Logik.
 * Hier gebündelt, aufbauend auf dem vorhandenen `extractFilename` (das auch
 * RFC-6266-Umlaute korrekt löst).
 *
 * NICHT hierher gehören ObjectURLs, die am Leben bleiben müssen — Vorschauen
 * (`setPreviewUrl`, `window.open`). Dort wäre ein sofortiges `revokeObjectURL`
 * ein Fehler, und genau deshalb sind diese Stellen bewusst nicht migriert.
 *
 * Bewusst keine React-Hooks: die Funktionen laufen in Event-Handlern.
 */

import { extractFilename } from "./download-filename";

/**
 * Wie lange die ObjectURL nach dem Klick noch gültig bleibt.
 *
 * Firefox und Safari brechen den Download ab, wenn die URL unmittelbar nach
 * `click()` widerrufen wird — der Browser hat den Blob dann noch nicht
 * abgeholt. Diese Erfahrung stand im Code bereits an der SEPA-Ausleitung
 * dokumentiert; der Wert ist von dort übernommen.
 *
 * Ein synchrones `revoke` im `finally` wäre also der bequemere, aber falsche
 * Weg gewesen.
 */
const REVOKE_DELAY_MS = 1000;

/**
 * Kern-Primitive: Blob als Datei speichern und die ObjectURL wieder freigeben.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  // Ohne Anhängen an das Dokument ignorieren einige Browser den Klick.
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Verzögert, aber verlässlich: ohne Freigabe hält der Blob Speicher bis zum
  // Reload.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/**
 * Lädt den Body einer Response als Datei herunter.
 *
 * Der Dateiname kommt aus `Content-Disposition`, sofern gesetzt — das ist der
 * Grund, diese Variante der manuellen zu bevorzugen: die Server-Routen setzen
 * dort teils RFC-6266-kodierte Namen mit Umlauten.
 *
 * @param response bereits geprüfte (res.ok) Antwort
 * @param fallbackFilename greift, wenn kein Dateiname im Header steht
 */
export async function downloadFromResponse(
  response: Response,
  fallbackFilename: string,
): Promise<void> {
  const blob = await response.blob();
  const filename =
    extractFilename(response.headers.get("Content-Disposition")) ?? fallbackFilename;
  downloadBlob(blob, filename);
}

/**
 * Beliebigen Text als Datei herunterladen (z. B. selbst gebautes CSV).
 *
 * Für CSV mit Umlauten muss der Aufrufer das BOM ("﻿") selbst voranstellen
 * — Excel erkennt UTF-8 sonst nicht.
 */
export function downloadText(
  content: string,
  filename: string,
  mimeType = "text/plain;charset=utf-8",
): void {
  downloadBlob(new Blob([content], { type: mimeType }), filename);
}
