/**
 * Die sharp-Aufrufe, auf denen die Karten im PDF beruhen.
 *
 * ## Warum dieser Test existiert
 *
 * `staticMap.ts` setzt Kartenkacheln zu einem Bild zusammen: erzeugen,
 * überlagern, ausschneiden, skalieren, ausgeben. Er tut das über sharp, und
 * sharp wurde von 0.34 auf 0.35 gehoben — wegen vier CVEs in libvips, die auf
 * unserem Weg erreichbar sind: die Kacheln kommen von einem **externen**
 * Kachelserver, also gehen fremde Bilddaten durch die Bibliothek.
 *
 * Der Sprung liess sich nicht am eigentlichen Weg prüfen: der braucht einen
 * erreichbaren Kachelserver. Also wird hier geprüft, was ohne Netz prüfbar
 * ist — **genau die Aufrufe**, die `staticMap.ts` benutzt, auf selbst
 * erzeugten Bildern.
 *
 * Das ist keine vollständige Absicherung und soll auch nicht so aussehen. Es
 * schliesst die Frage „hat 0.35 eine dieser Funktionen umgebaut?" — und das
 * war die Frage, die den Sprung sonst blockiert hätte.
 *
 * ## Was hier NICHT geprüft wird
 *
 * Ob die Karte am Ende richtig aussieht. Kachelberechnung, Zoomstufe,
 * Marker-Position — dafür bräuchte es den echten Weg mit echten Kacheln.
 */

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import type { OverlayOptions } from "sharp";

/** Ein einfarbiges PNG als Ersatz für eine heruntergeladene Kachel. */
async function kachel(groesse: number, farbe: { r: number; g: number; b: number }) {
  return sharp({
    create: {
      width: groesse,
      height: groesse,
      channels: 4,
      background: { ...farbe, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

describe("sharp-Aufrufe der PDF-Karte", () => {
  it("erzeugt eine Flaeche mit Hintergrund", async () => {
    const bild = await sharp({
      create: {
        width: 512,
        height: 256,
        channels: 4,
        background: { r: 240, g: 240, b: 240, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const meta = await sharp(bild).metadata();
    expect(meta.width).toBe(512);
    expect(meta.height).toBe(256);
  });

  it("ueberlagert Kacheln an gesetzten Stellen", async () => {
    // Genau das macht staticMap.ts mit den heruntergeladenen Kacheln.
    const a = await kachel(64, { r: 200, g: 0, b: 0 });
    const b = await kachel(64, { r: 0, g: 200, b: 0 });

    const overlays: OverlayOptions[] = [
      { input: a, top: 0, left: 0 },
      { input: b, top: 0, left: 64 },
    ];

    const zusammengesetzt = await sharp({
      create: { width: 128, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
    })
      .composite(overlays)
      .png()
      .toBuffer();

    const meta = await sharp(zusammengesetzt).metadata();
    expect(meta.width).toBe(128);
    expect(meta.height).toBe(64);
  });

  it("schneidet aus und skaliert auf die Zielgroesse", async () => {
    const gross = await sharp({
      create: { width: 256, height: 256, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const ausgeschnitten = await sharp(gross)
      .extract({ left: 32, top: 32, width: 128, height: 96 })
      .toBuffer();

    const nachSchnitt = await sharp(ausgeschnitten).metadata();
    expect(nachSchnitt.width).toBe(128);
    expect(nachSchnitt.height).toBe(96);

    const skaliert = await sharp(ausgeschnitten)
      .resize(64, 48, { fit: "fill" })
      .png()
      .toBuffer();

    const nachSkalierung = await sharp(skaliert).metadata();
    expect(nachSkalierung.width).toBe(64);
    expect(nachSkalierung.height).toBe(48);
    expect(nachSkalierung.format).toBe("png");
  });

  it("verweigert kaputte Bilddaten, statt still etwas zu liefern", async () => {
    // Der eigentliche Grund fuer den Sprung: die Kacheln kommen von aussen.
    // Ein Antwortkoerper, der kein Bild ist, muss zu einem Fehler fuehren —
    // nicht zu einem leeren Bild, das dann als Karte im PDF landet.
    const unsinn = Buffer.from("das ist kein bild");
    await expect(sharp(unsinn).metadata()).rejects.toThrow();
  });
});
