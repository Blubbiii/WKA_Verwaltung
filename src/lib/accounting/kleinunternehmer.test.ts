/**
 * Tests für §19 UStG Kleinunternehmer-Gate (P11).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  KleinunternehmerError,
  assertNotKleinunternehmer,
  isKleinunternehmer,
} from "./kleinunternehmer";

vi.mock("@/lib/tenant-settings", () => ({
  getTenantSettings: vi.fn(),
}));

import { getTenantSettings } from "@/lib/tenant-settings";

const mockSettings = getTenantSettings as unknown as ReturnType<typeof vi.fn>;

const baseSettings = {
  kleinunternehmer: false,
  // weitere Defaults nicht relevant für diese Tests
};

describe("KleinunternehmerError", () => {
  it("sets name and message", () => {
    const err = new KleinunternehmerError();
    expect(err.name).toBe("KleinunternehmerError");
    expect(err.message).toContain("§19 UStG");
  });

  it("is instanceof Error", () => {
    expect(new KleinunternehmerError()).toBeInstanceOf(Error);
  });
});

describe("assertNotKleinunternehmer", () => {
  beforeEach(() => mockSettings.mockReset());

  it("does not throw when tenant is regular (kleinunternehmer=false)", async () => {
    mockSettings.mockResolvedValue({ ...baseSettings, kleinunternehmer: false });
    await expect(assertNotKleinunternehmer("t-1")).resolves.toBeUndefined();
  });

  it("throws when tenant is kleinunternehmer", async () => {
    mockSettings.mockResolvedValue({ ...baseSettings, kleinunternehmer: true });
    await expect(assertNotKleinunternehmer("t-1")).rejects.toBeInstanceOf(
      KleinunternehmerError,
    );
  });
});

describe("isKleinunternehmer", () => {
  beforeEach(() => mockSettings.mockReset());

  it("returns true for kleinunternehmer", async () => {
    mockSettings.mockResolvedValue({ ...baseSettings, kleinunternehmer: true });
    expect(await isKleinunternehmer("t-1")).toBe(true);
  });

  it("returns false for regular tenant", async () => {
    mockSettings.mockResolvedValue({ ...baseSettings, kleinunternehmer: false });
    expect(await isKleinunternehmer("t-1")).toBe(false);
  });
});
