# Audit: Wizards, Modals & Action-Buttons — WPM

Scope: `src/components/**/*wizard*`, `src/components/sepa-wizard/**`, shadcn Dialog/Sheet-Modals, Action-Buttons in `src/app/(dashboard)/**`. 20 Findings, sortiert nach Prioritaet.

---

### 1. Wizard-Navigation via URL, kein Guard gegen direkten Deep-Link auf Step-2
- Priority: 🔴
- File: [src/app/(dashboard)/buchhaltung/sepa/new/step-2/page.tsx:73-77](src/app/(dashboard)/buchhaltung/sepa/new/step-2/page.tsx#L73)
- Bug: Guard-Effect `router.replace("...step-1")` feuert nur wenn `state.invoiceIds.length === 0`. Solange irgendein alter `invoiceIds`-Wert aus localStorage vorhanden ist, springt kein Guard und Step-2 zeigt Konten-Auswahl mit "toten" Rechnungs-IDs.
- User-Symptom: Nach mehrmaligem Wizard-Nutzen bleiben abgesendete/gelöschte Invoice-IDs in localStorage, Step-4 wirft 400 "invoice not found".
- Fix: In Step-4 nach `reset()` sicherstellen dass keys geloescht sind; zusaetzlich in Step-2 pruefen ob Invoices noch existieren (Server-Roundtrip oder TTL im State).

### 2. Doppel-Click auf "Jetzt berechnen" → 2× Settlement-POST
- Priority: 🔴
- File: [src/components/energy/settlement-wizard.tsx:365-411](src/components/energy/settlement-wizard.tsx#L365)
- Bug: `handleCalculate` prüft `calculating` **nicht** am Anfang. `setCalculating(true)` ist async, ein zweiter Klick vor Render kann in beide Aufrufen `settlementId===null` sehen → 2× `POST /api/energy/settlements`.
- User-Symptom: Duplicate Settlement-Record in DB, Unique-Constraint-Error oder Ghost-Settlement.
- Fix: `if (calculating) return;` als erste Zeile in handleCalculate.

### 3. Wizard-State Verlust bei Back-Button (react-grid-layout Modus)
- Priority: 🔴
- File: [src/components/energy/settlement-wizard.tsx:519-528](src/components/energy/settlement-wizard.tsx#L519)
- Bug: `handleBack` prüft `step === 2 && settlementId` und fragt via `window.confirm`. Beim Klick auf "Zurück" wird aber `settlementId` **nicht** null gesetzt. Beim naechsten Vorlauf zu Step 2 wird bestehende Settlement gecalcet, was OK ist — aber Werte aus Step-2-Form (`formData.productionKwh` etc.) werden ignoriert, weil die Settlement schon existiert. Nutzer aendert nichts effektiv.
- User-Symptom: Zurueck → Wert korrigieren → Weiter → Berechnung nutzt alte Werte, Nutzer wundert sich.
- Fix: Bei Confirm → `setSettlementId(null); setCalculationResult(null);` explizit.

### 4. Dialog `onOpenChange` ignoriert Boolean-Parameter, navigiert bei jedem Change
- Priority: 🔴
- File: [src/components/funds/onboarding-wizard.tsx:362](src/components/funds/onboarding-wizard.tsx#L362)
- Bug: `<Dialog onOpenChange={handleResultDialogClose}>` — Radix ruft `onOpenChange(bool)` mit dem neuen Zustand. `handleResultDialogClose` ignoriert das Argument und macht `setShowResultDialog(false); router.push(...)`. Beim Overlay-Click **oder** Escape wird das gefeuert — Password-Card mit einmalig sichtbarem Passwort verschwindet und Nutzer landet auf Fund-Detail-Seite.
- User-Symptom: User klickt neben Dialog → temporaeres Passwort ist **weg**, kein Recovery moeglich.
- Fix: `onOpenChange={(open) => { if (!open) handleResultDialogClose(); }}` und/oder Dialog non-dismissible (`onEscapeKeyDown`+`onInteractOutside` preventDefault).

### 5. `router.push` nach `setState` in Success-Callback ohne Race-Schutz
- Priority: 🔴
- File: [src/app/(dashboard)/kommunikation/erstellen/page.tsx:242-263](src/app/(dashboard)/kommunikation/erstellen/page.tsx#L242)
- Bug: `handleSend` macht `toast.success(...); router.push("/kommunikation");` **innerhalb** try-Block. Der `finally { setSending(false) }` läuft nach unmount → React Warning "state update on unmounted component" + je nach Timing wird `setSending(false)` gar nicht erreicht.
- User-Symptom: Bei langsamer Nav bleibt Button in Spinner-State, wenn User zurück-navigiert.
- Fix: `router.push` in `finally` verschieben oder mit `unmounted`-Guard versehen.

### 6. Tenant-Onboarding: `handleSkip` überspringt Aktion, führt Backend aber nicht aus
- Priority: 🔴
- File: [src/components/admin/tenant-onboarding-wizard.tsx:1044-1046](src/components/admin/tenant-onboarding-wizard.tsx#L1044)
- Bug: `handleSkip` macht nur `setCurrentStep(currentStep + 1)`. Wenn User in Step 1 (Park) skipt, wird `createdParkId` nie gesetzt. Step 3 (Fund) linkt dann in `handleCreateFund` (Zeile 332) nur wenn `createdParkId` existiert — was OK ist. Aber die Reihenfolge-Logik der `SummaryItem`s (Zeile 927-946) zeigt trotzdem "Skipped" fuer alles was nicht created wurde — kein Bug per se, aber `companyUpdated` bleibt false wenn User in Step 0 skipt, obwohl das Tenant bereits Daten hat. Verwirrend fuer User.
- User-Symptom: Skip-Aktion loescht keine bereits eingegebenen Daten in Firma-Form; Summary zeigt "Uebersprungen" obwohl User Werte eingegeben hat.
- Fix: Skip-Handler leeren; Summary auf Basis von `onboardingStatus.steps` zeigen, nicht auf lokalen `companyUpdated`.

### 7. FormData wird bei Modal-Close nicht resettet (ProductionEntryDialog)
- Priority: 🟡
- File: [src/components/energy/production-entry-dialog.tsx:175-212](src/components/energy/production-entry-dialog.tsx#L175)
- Bug: `useEffect` mit `if (open) { ... }` setzt Form nur beim Oeffnen. Beim Schliessen bleiben Werte im State. Wenn parent den Dialog neu oeffnet **ohne** `editData`, wird zwar sauber zurueckgesetzt — aber wenn Dialog von "edit A" auf "edit B" wechselt, waehrend `open===true` bleibt (parent ändert nur editData), triggert der Effect korrekt. Race: `parkId`-Change-Effect (Zeile 215) laeuft aber und ueberschreibt `turbineId` bevor `editData`-Effect fertig ist.
- User-Symptom: Bei schnellem Wechsel zwischen Edit-Rows wird Turbine auf leer gesetzt.
- Fix: `useEffect` merge in einen einzigen Effect mit klarer Reihenfolge, oder `key={editData?.id ?? "new"}` am Dialog-Wrapper.

### 8. `useState<items.map(...)>` in Dialog — kein Reset bei items-Prop-Change
- Priority: 🟡
- File: [src/components/invoices/partial-cancel-dialog.tsx:77-96](src/components/invoices/partial-cancel-dialog.tsx#L77) und [src/components/invoices/correction-dialog.tsx:92-117](src/components/invoices/correction-dialog.tsx#L92)
- Bug: `useState` initialisiert `positions` aus `items` — laeuft nur einmal. `handleOpenChange` resettet nur bei `newOpen===true`. Falls Parent `items`-Prop aktualisiert (z.B. nach Backend-Refresh) waehrend Dialog offen ist, zeigt UI stale positions.
- User-Symptom: Kann in Praxis vorkommen wenn Invoice waehrend offenem Dialog serverseitig geaendert wurde.
- Fix: `useEffect(() => { setPositions(items.map(...)) }, [items])` — oder `key={items.length}` am Dialog.

### 9. SEPA-Wizard Step-4 Submit-Effect hat `state` in Deps
- Priority: 🟡
- File: [src/app/(dashboard)/buchhaltung/sepa/new/step-4/page.tsx:74-126](src/app/(dashboard)/buchhaltung/sepa/new/step-4/page.tsx#L74)
- Bug: `useEffect(..., [hydrated, state, t])` — jedes `setState`-Update im Wizard erzeugt neue `state`-Referenz und re-running effect. `submittedRef.current` schuetzt aber der Effect laeuft **doppelt** und die 2. Ausfuehrung landet im early-return. Kein direkter Bug — Cleanup-Function `cancelled=true` triggert bei erstem Re-Run und markiert die Original-Anfrage abgebrochen, obwohl sie noch laeuft → `setResult`/`setError` werden nicht mehr gesetzt.
- User-Symptom: In seltenen Faellen bleibt Spinner ewig, weil `cancelled=true` gesetzt wurde bevor die fetch-Response da war.
- Fix: Deps auf primitive Werte (`state.invoiceIds.length`, `state.bankAccountId`, ...) reduzieren oder `useRef` fuer state-snapshot.

### 10. Tenant-Onboarding Step-3 unbeschraenkter Wechsel zwischen Steps via Stepper-Click
- Priority: 🟡
- File: [src/components/admin/tenant-onboarding-wizard.tsx:1079-1083](src/components/admin/tenant-onboarding-wizard.tsx#L1079)
- Bug: `onStepClick={(step) => { if (step < currentStep) setCurrentStep(step); }}`. Nach Step-Skip landet man auf Step 4 (Done). Klick auf Step-Indicator 2 (Fund) fuehrt zurueck — aber Formularinhalt fuer Fund wurde nie gefuellt/gecommitet, `fund.name` ist leer, Nutzer sieht wieder leeres Formular obwohl backend eigentlich schon einen Park hat. Kein Reload von `onboardingStatus`.
- User-Symptom: Zurueck zu abgeschlossenen Steps zeigt leeres Formular statt persistierte Werte.
- Fix: Bei Step-Wechsel `loadOnboardingStatus()` erneut oder Werte aus Backend rehydraten.

### 11. `handleReject` Confirmation-Cancel-Handler beim Schliessen resettet Rejection-Notes NICHT immer
- Priority: 🟡
- File: [src/app/(dashboard)/admin/settlement-periods/[id]/page.tsx:1119-1122](src/app/(dashboard)/admin/settlement-periods/[id]/page.tsx#L1119)
- Bug: `onOpenChange={(open) => { setShowRejectDialog(open); if (!open) setRejectionNotes(""); }}` — dies funktioniert. **Aber** bei Abbrechen-Button (Zeile 1144) wird `setRejectionNotes("")` doppelt gesetzt.
- User-Symptom: Kein Bug, nur redundant.
- Fix: Nur einen Weg definieren.

### 12. `handleDelete` setzt Dialog-State nach `router.push` (post-unmount)
- Priority: 🟡
- File: [src/app/(dashboard)/admin/settlement-periods/[id]/page.tsx:333-345](src/app/(dashboard)/admin/settlement-periods/[id]/page.tsx#L333)
- Bug: `router.push("/admin/settlement-periods")` waehrend `finally` setzt `setShowDeleteDialog(false)`. Nach Navigation ist Component unmounted → React Warning.
- User-Symptom: Console-Warning, sonst harmlos.
- Fix: `setShowDeleteDialog(false)` **vor** dem push, oder push nach setState und return.

### 13. Wizard-Step-Actions zeigen "Weiter" auch fuer Step 2 (SettlementWizard) obwohl Berechnung obligatorisch
- Priority: 🟡
- File: [src/components/energy/settlement-wizard.tsx:1656-1684](src/components/energy/settlement-wizard.tsx#L1656)
- Bug: Rendering-Logik: `step < 2 → "Weiter"` normal, `step === 2 && calculationResult → "Weiter zu Gutschriften"`. Wenn calculationResult null ist (User hat nicht berechnet), gibt es **keinen** Weiter-Button — nur "Zurueck"/"Abbrechen". User muss explizit "Jetzt berechnen" klicken. Kein Bug, aber unklar fuer Nutzer weil kein Hinweis, dass Berechnung noetig ist.
- User-Symptom: "Wo ist der Weiter-Button?"
- Fix: Disable-Button mit Tooltip "Bitte zuerst berechnen" anzeigen.

### 14. `AddTurbineDialog` — Reset-Funktion in onOpenChange kann Race mit onSuccess-Reset
- Priority: 🟡
- File: [src/components/parks/turbine-dialogs/AddTurbineDialog.tsx:332](src/components/parks/turbine-dialogs/AddTurbineDialog.tsx#L332)
- Bug: `onOpenChange={(open) => { if (!open) resetForm(); setIsOpen(open); }}` — beim Success in `handleSubmit` wird `resetForm(); setIsOpen(false);` explizit gemacht (Zeile 276-277). Dann triggert Radix `onOpenChange(false)` → nochmal `resetForm()`. Doppelt, harmlos.
- User-Symptom: Keiner sichtbar.
- Fix: Nur eine Stelle fuer Reset.

### 15. Confirmation-Dialog: Toast-Message bei catch fehlt Detail-Info (fetch-error direkt)
- Priority: 🟡
- File: [src/components/energy/settlement-wizard.tsx:429-435](src/components/energy/settlement-wizard.tsx#L429)
- Bug: `toast.error(err instanceof Error ? err.message : t("calculationError"))` — der `err.message` ist bei Network-Errors "Failed to fetch" ohne Kontext.
- User-Symptom: Cryptic-Toast "Failed to fetch" wenn Netz weg.
- Fix: Message wrappen: `t("calculationError") + ": " + err.message`.

### 16. Contract-Wizard `router.back()` als Abbrechen-Aktion → verwirrend
- Priority: 🟡
- File: [src/components/contracts/contract-wizard.tsx:1333](src/components/contracts/contract-wizard.tsx#L1333)
- Bug: Abbrechen-Button macht `router.back()` — wenn User via Direct-Link (Bookmark) kam, geht "back" ins Nirgendwo (browser-history-fallback).
- User-Symptom: Abbrechen fuehrt zu external URL.
- Fix: `router.push("/contracts")` statt back.

### 17. `handleInviteUsers` iteriert per await in Loop → 5× seriell, kein Cancel
- Priority: 🟡
- File: [src/components/admin/tenant-onboarding-wizard.tsx:418-445](src/components/admin/tenant-onboarding-wizard.tsx#L418)
- Bug: `for (const user of validUsers) await fetch(...)` seriell. Ohne AbortController — wenn User waehrend Loop weg-navigiert, laufen alle Requests weiter, `setInvitedUsers`/`setCurrentStep(4)` triggert nach Unmount.
- User-Symptom: React Warning + evtl. inkonsistenter DB-State (nur teilweise User angelegt).
- Fix: `Promise.all` mit korrektem Error-Handling, AbortController per Component.

### 18. `handleCreateFund` ignoriert Fehler bei fund-park-Link → silent inconsistency
- Priority: 🟡
- File: [src/components/admin/tenant-onboarding-wizard.tsx:332-348](src/components/admin/tenant-onboarding-wizard.tsx#L332)
- Bug: Verknuepfung von Fund mit Park in try-catch mit leerem catch. Kein User-Feedback wenn Link fehlschlaegt.
- User-Symptom: Fund ist da, aber nicht mit Park verknuepft — User denkt alles OK.
- Fix: Toast.warning bei Link-Failure mit Hinweis "manuell nachbessern".

### 19. Sepa-Wizard Step-Indicator: Link statt Button — kein "Back-Warning" bei State-Verlust
- Priority: 🟡
- File: [src/components/sepa-wizard/step-indicator.tsx:79-89](src/components/sepa-wizard/step-indicator.tsx#L79)
- Bug: Klick auf abgeschlossenen Step-Indicator ist ein `<Link href>`. Kein Confirmation-Dialog beim Wechsel — bei Step-3-Ergebnis waere ein Reset via Zurueck-Klick unerwuenscht wenn Nutzer gerade Reviewt hat. Kein direkter Bug (State ueberlebt in localStorage), aber inkonsistent zu SettlementWizard das `window.confirm` nutzt.
- User-Symptom: Wenn User in Step 3 versehentlich auf Step-1-Indicator klickt, verliert er den Bestaetigungs-Screen (Rechnungsauswahl wird zurueckgesetzt, wenn er dort selektiert).
- Fix: Hinweis-Toast, oder Link nur wenn State-Konsistenz garantiert.

### 20. `Stepper` clickable Konnektor-Line hat wrong-width overlap (visual)
- Priority: 🟡
- File: [src/components/ui/stepper.tsx:32-40](src/components/ui/stepper.tsx#L32)
- Bug: Konnektor-Linie mit `style={{ width: "calc(100% - 1rem)", right: "50%" }}` positioniert falsch — bei kleinen Screens (<640px) kann sie ueber Klick-Bereich des Steps ragen und Klicks unabsichtlich schlucken.
- User-Symptom: Auf Mobile-Layout unklickbare Stepper-Punkte.
- Fix: Line mit `pointer-events: none` (`className="pointer-events-none ..."`).

---

**Zusammenfassung:**
- 6× 🔴 Priority-1 (Wizards, Dialogs, State-Race)
- 14× 🟡 Priority-2 (Cleanup, Cosmetics, Edge-Cases)
- Groesste Baustellen: SettlementWizard (Bug 2, 3, 13), Tenant-Onboarding (Bug 6, 10, 17, 18), SEPA-Wizard-State (Bug 1, 9), Result-Dialog (Bug 4).
