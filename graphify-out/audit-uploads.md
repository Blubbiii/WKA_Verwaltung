# Audit: Uploads / Downloads / File-Handling (WPM)

Datum: 2026-07-10 · Umfang: `src/components/**upload**`, `src/hooks/useFileUpload.ts`, `src/app/api/**upload/import/export/download**`, `src/lib/tus/**`, PDF-Viewer, Uppy V2.

Sortiert nach Kritikalität. Zeilenangaben sind stabil zum aktuellen Stand.

---

## 1. Turbine-Import (XLSX): Client schickt FormData an JSON-Endpoint

**Priorität:** Kritisch (feature-breaking)
**Datei:** [energy/turbine-import/page.tsx:1039-1050](src/app/(dashboard)/energy/turbine-import/page.tsx#L1039) und [api/energy/productions/import/route.ts:398-410](src/app/api/energy/productions/import/route.ts#L398)
**Bug:** Client POSTet `FormData` mit `action="parse"`. Server ruft `await request.json()` (Zeile 403) und akzeptiert nur `action: "validate" | "import"` per Zod. Jeder XLSX-Turbinen-Import scheitert mit 400 / Zod-Error.
**Symptom:** "Fehler beim Parsen der Datei" bei jeder Excel-Datei; CSV geht.
**Fix:** Entweder Server-Route um `multipart/form-data`-Zweig ergänzen (mit XLSX-Parser, z.B. `xlsx`-lib), oder Client parst XLSX clientseitig (wie CSV) via `xlsx`-Lib und schickt `{ action:"import", mapping, data }` als JSON.

---

## 2. `useFileUpload`: `res.json()`-Fallback wirft weiter, statt sauber Text-Fallback zu behandeln

**Priorität:** Hoch
**Datei:** [hooks/useFileUpload.ts:87-107](src/hooks/useFileUpload.ts#L87)
**Bug:** Bei Server-500 mit HTML-Response wird `JSON.parse` in `try/catch` gefangen und `responseData = xhr.responseText` (kompletter HTML-Body). Danach greift `(responseData as {error?}).error` auf einen String zu und liefert `undefined`, Fallback ist der generische Status-Text. User sieht nie den echten Fehler.
**Symptom:** "Upload fehlgeschlagen (Status 500)" ohne Details, obwohl der Server einen Fehler geloggt hat.
**Fix:** Beim JSON-Parse-Fehler `xhr.getResponseHeader("Content-Type")` prüfen und bei Nicht-JSON generische Meldung + Snippet loggen (kein HTML in Toast).

---

## 3. Blob-URL: `revokeObjectURL()` unmittelbar nach `.click()` (Race)

**Priorität:** Hoch
**Dateien:**
- [buchhaltung/zahlungen/tabs/sepa.tsx:124-129](src/app/(dashboard)/buchhaltung/zahlungen/tabs/sepa.tsx#L124)
- [invoices/dispatch/page.tsx:294-299](src/app/(dashboard)/invoices/dispatch/page.tsx#L294), [dispatch/page.tsx:341-346](src/app/(dashboard)/invoices/dispatch/page.tsx#L341), [dispatch/page.tsx:251-256](src/app/(dashboard)/invoices/dispatch/page.tsx#L251)

**Bug:** `<a>` nicht ans DOM angehängt; `URL.revokeObjectURL(url)` läuft SYNCHRON direkt nach `link.click()`. In Firefox/Safari kann das den Download abbrechen, weil der Browser die Blob-URL noch nicht gelesen hat.
**Symptom:** Download-Klick "macht nichts" (sporadisch, Firefox/Safari), oder speichert 0-Byte-Datei.
**Fix:** `document.body.appendChild(link) → click() → link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);` (dispatch/page.tsx macht das im Loop 3-mal — dort auch pro Iteration ein `<a>` an Body hängen und wieder entfernen).

---

## 4. LetterheadSettings PDF-Preview: `URL.createObjectURL` nie revoked

**Priorität:** Mittel (Memory-Leak)
**Datei:** [components/settings/LetterheadSettings.tsx:340-347](src/components/settings/LetterheadSettings.tsx#L340)
**Bug:** `const url = URL.createObjectURL(blob); window.open(url, "_blank");` — kein `revokeObjectURL`. Bei jedem Preview leakt eine PDF-Blob-Referenz (können mehrere MB sein).
**Symptom:** Nach 10+ Previews steigt Tab-RAM merklich; Chrome-Devtools zeigt gehäufte Blob-Einträge.
**Fix:** Nach `window.open` mit Timeout revoken (`setTimeout(() => URL.revokeObjectURL(url), 60_000)`), oder auf Route-Change im `useEffect`-Cleanup.

---

## 5. UppyScadaUpload: File-Type-Whitelist inkonsistent (Client `<input accept>` vs. Uppy `allowedFileTypes`)

**Priorität:** Mittel
**Datei:** [components/energy/scada/UppyScadaUpload.tsx:159, 424, 434](src/components/energy/scada/UppyScadaUpload.tsx#L159)
**Bug:** Beim **Ordner-Upload** (Zeile 431-441) hat der `<input webkitdirectory>` KEIN `accept`-Attribut. Der Browser liefert ALLE Dateien im Ordner (`.txt`, `.pdf`, `.jpg`, …), und `addFiles()` sortiert sie via `SCADA_EXTENSIONS_SET.has(ext)` in die `rejected`-Liste. Bei 5000-Datei-Ordnern (Enercon-Root) werden 4800 Dateien einzeln in State geschrieben → langsamer setState-Storm.
**Symptom:** Ordner-Auswahl "hängt" 5-10 Sekunden bei großen Verzeichnissen.
**Fix:** Vor `addFiles` einmalig `arr = arr.filter(f => SCADA_EXTENSIONS_SET.has(ext(f)))` und den Anzahl-Delta batch-in-State (`setRejected(prev => [...prev, ...batchRejected])`) statt in der Schleife.

---

## 6. UppyDropzone: Uppy-Restriktion `allowedFileTypes` als Dot-Extensions

**Priorität:** Mittel
**Datei:** [components/ui/uppy-dropzone.tsx:116](src/components/ui/uppy-dropzone.tsx#L116)
**Bug:** `accept.split(",").map(s=>s.trim())` liefert `[".pdf", ".doc", …]`. Uppy erwartet in `allowedFileTypes` entweder MIME-Types (`application/pdf`) ODER Dot-Extensions, beides gemischt geht — aber Uppy 4.x prüft **Dot-Extension gegen `file.name`** case-sensitive. `Foto.JPG` (Großbuchstaben-Ext) wird abgelehnt.
**Symptom:** Camera-Uploads (iOS liefert `IMG_0001.JPG`) werden mit "file type not allowed" abgewiesen, obwohl `.jpg` in accept steht.
**Fix:** Vor Uppy `restrictions.allowedFileTypes` alle Extensions **doppeln in lower+upper** oder lower-case-Vergleich in `addFile` (`file.name = file.name.toLowerCase()` beim Übergeben).

---

## 7. `res.json()` ohne Content-Type-Check → HTML-Crash

**Priorität:** Mittel (breit gestreut)
**Dateien (Beispielhaft, gleicher Bug in ~40 Files):**
- [invoices/bank-import/page.tsx:133](src/app/(dashboard)/invoices/bank-import/page.tsx#L133)
- [energy/turbine-import/page.tsx:1049,1053](src/app/(dashboard)/energy/turbine-import/page.tsx#L1049)
- [components/admin/RoleManagement.tsx:324](src/components/admin/RoleManagement.tsx#L324)

**Bug:** Nach `fetch` wird ohne Ausnahme direkt `res.json()` aufgerufen. Wenn Next-Middleware/Nginx eine HTML-Errorpage zurückgibt (503 upstream, 502 gateway), crasht der Parse — im happy-catch verschwindet der echte Fehler.
**Symptom:** Bei Traefik/Portainer-Restart sehen User "uploadConnectionError", obwohl der Upload durchging.
**Fix:** Helper `safeJson(res)`, die `res.headers.get("content-type")?.includes("json")` prüft, sonst `{error: await res.text().then(t => t.slice(0,200))}` liefert.

---

## 8. PDF-Viewer: `pdfjs.GlobalWorkerOptions.workerSrc` in useEffect + `setTimeout(0)`-Hack

**Priorität:** Niedrig-Mittel (Timing-Race)
**Datei:** [components/documents/DocumentPreviewDialogPDF.tsx:60-64](src/components/documents/DocumentPreviewDialogPDF.tsx#L60)
**Bug:** Worker-src wird ERST in `useEffect` gesetzt, dann `setTimeout(0)` bis `workerReady=true`. Zwischen `<Document file={fileUrl}>`-Mount und Worker-Init kann `Document` versuchen zu rendern, bevor `workerSrc` global gesetzt ist — führt zu "Setting up fake worker failed"-Warning und manchmal `Failed to fetch dynamically imported module`.
**Symptom:** Sporadisch beim ersten PDF-Öffnen: leerer Viewer, F5 reicht → geht.
**Fix:** `pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";` als **Module-Top-Level-Statement** (außerhalb Komponente) und `workerReady`-Gate + `setTimeout` streichen.

---

## 9. DocumentPreviewDialog: `presignedUrl` Init in `setTimeout(0)` verzögert Loading-State

**Priorität:** Niedrig
**Datei:** [components/documents/DocumentPreviewDialog.tsx:73-93](src/components/documents/DocumentPreviewDialog.tsx#L73)
**Bug:** `useEffect` mit `setTimeout(() => { … setPresignedUrl(…) }, 0)` verzögert das Setzen der URL um einen Frame. Kombiniert mit `next/image`-`onLoad` (Zeile 253) kann `loading` auf `true` hängen bleiben, wenn `Image` sein `onLoad` beim ersten Render feuert bevor `setLoading(true)` propagiert.
**Symptom:** Bild-Vorschau zeigt Spinner permanent.
**Fix:** State-Reset direkt im effect (ohne `setTimeout`).

---

## 10. LetterheadSettings PDF-Type-Check via `file.type` (Firefox unreliable)

**Priorität:** Niedrig
**Datei:** [components/settings/LetterheadSettings.tsx:225](src/components/settings/LetterheadSettings.tsx#L225)
**Bug:** `if (file.type !== "application/pdf")` — Firefox unter Windows liefert bei .pdf-Files aus manchen Quellen `""` als MIME (kein OS-Handler). User bekommt "invalidPdfType", obwohl es ein PDF ist.
**Fix:** Zusätzlich Extension prüfen (`file.name.toLowerCase().endsWith(".pdf")`).

---

## 11. `filename="(.+)"` Content-Disposition Regex: bricht bei UTF-8 filename*= und Umlauten

**Priorität:** Niedrig
**Dateien:** [report-configs-tab.tsx:169](src/components/energy/analytics/report-configs-tab.tsx#L169), [report-builder-tab.tsx:436](src/components/energy/analytics/report-builder-tab.tsx#L436), [pdf-reports-tab.tsx:175](src/components/energy/analytics/pdf-reports-tab.tsx#L175), [invoices/[id]/page.tsx:474](src/app/(dashboard)/invoices/[id]/page.tsx#L474), [votes/[id]/page.tsx:157](src/app/(dashboard)/votes/[id]/page.tsx#L157)
**Bug:** Regex matcht nur `filename="…"` (RFC 2183). Wenn Server per RFC 6266 `filename*=UTF-8''…` liefert (für Umlaute/Sonderzeichen), bekommt User Fallback-Filename statt echtem.
**Symptom:** Berichte mit Umlauten (`Bericht_Süd.pdf`) werden als `Bericht_${year}.pdf` gespeichert.
**Fix:** Regex `/filename\*?=(?:UTF-8'')?"?([^";\r\n]+)"?/i` + `decodeURIComponent()` wenn `filename*=` gematched wurde.

---

## 12. Paperless-Upload: `Blob` ohne MIME-Type

**Priorität:** Niedrig
**Datei:** [lib/paperless/client.ts:152-153](src/lib/paperless/client.ts#L152)
**Bug:** `new Blob([new Uint8Array(file)])` ohne `{type: "application/pdf"}`. Paperless-ngx-Task kann Content-Type nicht erkennen, was in strikten Setups zu `unable to determine mime` führt.
**Fix:** `new Blob([new Uint8Array(file)], { type: options.mimeType ?? "application/octet-stream" })` und `PaperlessUploadOptions` um `mimeType` erweitern.

---

## 13. FileUploadDropzone V1: `res.json()` ohne Type-Check + kein Multi-File-Progress

**Priorität:** Niedrig (V1-Legacy, Uppy-V2 unter Flag aktiv)
**Datei:** [components/ui/file-upload-dropzone.tsx:86,166](src/components/ui/file-upload-dropzone.tsx#L86)
**Bug:** Sequenzieller `for (const file …) await fetch(…)` blockiert 10 Files nacheinander (Uploads könnten parallelisiert werden mit `Promise.allSettled` und Concurrency-Limit). Und beim Erfolg zeigt `progress` nichts (kein XHR, kein Uppy).
**Fix:** V2 durch Feature-Flag flächendeckend aktivieren und V1 entfernen.

---

## Zusammenfassung Handlungsprioritäten

| # | Auswirkung | Aufwand |
|---|---|---|
| 1 | Turbinen-XLSX-Import komplett kaputt | mittel (server-side FormData-Zweig + xlsx parse) |
| 2 | Alle Upload-Fehlermeldungen unklar | klein |
| 3 | Sporadisch fehlschlagende Downloads (Firefox/Safari) | klein |
| 4 | Memory-Leak bei Briefpapier-Preview | trivial |
| 5 | Ordner-Upload hängt bei 5000 Files | klein |
| 6 | iOS-Camera-JPGs abgelehnt | trivial |

Quick-Wins zuerst: #2, #4, #6 lösen sich in <30 min pro Fix.
