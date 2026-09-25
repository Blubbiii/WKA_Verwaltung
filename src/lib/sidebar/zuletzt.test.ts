/**
 * "Zuletzt besucht" aus dem Cookie lesen.
 *
 * Die Liste lag nur im localStorage — den sieht der Server nicht, also
 * erschien sie erst nach dem Laden und schob die Menügruppen nach unten. Jetzt
 * liegt sie zusätzlich in einem Cookie. Was aus dem Cookie kommt, wird als Link
 * ausgegeben und deshalb streng geprüft.
 */

import { describe, expect, it } from "vitest";
import { leseZuletzt, ZULETZT_COOKIE } from "./zuletzt";

const roh = (x: unknown) => encodeURIComponent(JSON.stringify(x));

describe("leseZuletzt", () => {
  it("liest gültige Einträge", () => {
    expect(leseZuletzt(roh([{ href: "/parks", label: "Parks" }]))).toEqual([{ href: "/parks", label: "Parks" }]);
  });

  it("verwirft alles, was kein interner Pfad ist", () => {
    const boese = [
      { href: "javascript:alert(1)", label: "x" },
      { href: "//evil.example/x", label: "x" },
      { href: "https://evil.example", label: "x" },
      { href: "/\\evil", label: "x" },
      { href: "/ok", label: 5 },
      { href: "/ok2", label: "y".repeat(200) },
    ];
    expect(leseZuletzt(roh(boese))).toEqual([]);
  });

  it("kaputter Inhalt ergibt eine leere Liste", () => {
    expect(leseZuletzt("%7Bnicht-json")).toEqual([]);
    expect(leseZuletzt(roh({ href: "/x" }))).toEqual([]);
    expect(leseZuletzt(undefined)).toEqual([]);
  });

  it("höchstens acht Einträge", () => {
    const viele = Array.from({ length: 20 }, (_, i) => ({ href: `/p${i}`, label: `P${i}` }));
    expect(leseZuletzt(roh(viele))).toHaveLength(8);
  });

  it("der Cookie-Name ist fest", () => {
    expect(ZULETZT_COOKIE).toBe("wpm-zuletzt");
  });
});
