import { describe, expect, it } from "vitest";
import { berichtsPhase, WARTESCHLANGE_HAENGT_MS } from "./report-job";

describe("Bericht im Hintergrund: Zustand des Auftrags", () => {
  it("BullMQ-Zustände werden auf vier Phasen abgebildet", () => {
    expect(berichtsPhase("waiting", 0)).toBe("wartet");
    expect(berichtsPhase("delayed", 0)).toBe("wartet");
    expect(berichtsPhase("active", 0)).toBe("laeuft");
    expect(berichtsPhase("completed", 0)).toBe("fertig");
    expect(berichtsPhase("failed", 0)).toBe("fehler");
    expect(berichtsPhase("unknown", 0)).toBe("fehler");
  });

  it("wer zu lange in der Warteschlange steht, hängt — dann läuft kein Worker", () => {
    expect(berichtsPhase("waiting", WARTESCHLANGE_HAENGT_MS - 1)).toBe("wartet");
    expect(berichtsPhase("waiting", WARTESCHLANGE_HAENGT_MS)).toBe("haengt");
    // Once a worker has it, a long run is just a long run.
    expect(berichtsPhase("active", WARTESCHLANGE_HAENGT_MS * 3)).toBe("laeuft");
  });
});
