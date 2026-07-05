# SCADA Test Fixtures

Echte Enercon-DBF-Dateien für Reader- und Discovery-Snapshot-Tests.

## Herkunft
Kopiert aus einem produktiv genutzten Windpark am 2026-07-05. Location-Verzeichnis
umbenannt in `Loc_TEST` (keine Rückführung auf den echten Standort). Plant-Number
in den DBF-Records ist unverändert — reine Sensor-/Identifier-Nummer, keine PII.

## Struktur
```
Loc_TEST/
  2026/
    01/                     ← Daily-Files (10-Minuten-Werte)
      20260101.wsd          Wind Speed (Enercon-Standard-Sensor-Set)
      20260101.uid          Electrical (P/Q/S, cos φ, U1-3, I1-3)
      20260101.uqd          Reactive per-phase
      20260101.wdd          Shadow Casting
      20260101.84d          Operating-State codes (A0-A39)
      20260101.85d          Operating-State codes (A48+)
    20260100.avm            Availability Monthly
    20260100.avr            Availability Rolling
    20260100.pes            Power/State Events
    20260100.ssm            State Summary Monthly
    20260100.swm            Warning Summary Monthly
    20260100.wsr            Wind Summary Rolling
```

## Verwendung
```ts
import { fixturePath } from "./__fixtures__/paths";

const records = await readWsdFile(fixturePath("Loc_TEST/2026/01/20260101.wsd"));
expect(records).toMatchSnapshot();
```

## Warum echte Files statt Fake-Data?
Enercon-DBF-Files haben komplexe Header-Strukturen (dBASE III mit spezifischen
Field-Descriptors). Fake-Files würden das Format nur simulieren — echte Files
fangen echte Reader-Bugs. Beispielsweise wurde dadurch entdeckt dass WSD 38
Felder hat, unser Reader aber nur 5 las (§13a EnWG Curtailment-Daten verloren).

## Bei Firmware-Updates
Wenn Enercon eine neue Firmware-Version ausrollt und neue Felder in den DBFs
erscheinen: neue Fixtures hinzufügen (nicht ersetzen). Alte Snapshots dienen
als Regressionsschutz — der Reader muss weiterhin die alten Files korrekt lesen.
