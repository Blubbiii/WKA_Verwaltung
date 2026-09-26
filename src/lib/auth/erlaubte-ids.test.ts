import { describe, expect, it } from "vitest";
import { erlaubteIds, istErlaubt } from "./erlaubte-ids";

describe("Zugriffsliste: Benutzer-Freigabe und Rollen-Einschränkung", () => {
  it("ohne beides: keine Einschränkung", () => {
    expect(erlaubteIds(null, null)).toBeNull();
  });

  it("nur eine Seite schränkt ein: die gilt", () => {
    expect(erlaubteIds(["a", "b"], null)).toEqual(["a", "b"]);
    expect(erlaubteIds(null, ["c"])).toEqual(["c"]);
  });

  it("beide: nur was beide erlauben", () => {
    expect(erlaubteIds(["a", "b"], ["b", "c"])).toEqual(["b"]);
    // Disjoint lists mean nothing — not everything.
    expect(erlaubteIds(["a"], ["c"])).toEqual([]);
  });

  it("eine leere Rollenliste ist keine Einschränkung (so behandeln es die Routen)", () => {
    expect(erlaubteIds(["a"], [])).toEqual(["a"]);
  });

  it("istErlaubt", () => {
    expect(istErlaubt(null, "x")).toBe(true);
    expect(istErlaubt(["x"], "x")).toBe(true);
    expect(istErlaubt(["y"], "x")).toBe(false);
    expect(istErlaubt([], "x")).toBe(false);
  });
});
