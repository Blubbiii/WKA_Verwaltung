import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateIcsCalendar, IcsEvent } from "../ics";

/**
 * Helper to create a test event with sensible defaults
 */
function makeEvent(overrides: Partial<IcsEvent> = {}): IcsEvent {
  return {
    uid: "test-uid-1@windparkmanager",
    summary: "Test Event",
    dtstart: new Date("2026-06-15T00:00:00Z"),
    ...overrides,
  };
}

describe("ICS Calendar Generator", () => {
  // Freeze DTSTAMP so snapshots are deterministic
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
  });

  // ----------------------------------------------------------------
  // generateIcsCalendar basics
  // ----------------------------------------------------------------
  describe("generateIcsCalendar basics", () => {
    it("returns a valid VCALENDAR wrapper", () => {
      const ics = generateIcsCalendar([]);
      expect(ics).toContain("BEGIN:VCALENDAR");
      expect(ics).toContain("END:VCALENDAR");
      expect(ics).toContain("VERSION:2.0");
    });

    it("contains PRODID with WindparkManager", () => {
      const ics = generateIcsCalendar([]);
      expect(ics).toContain("PRODID:-//WindparkManager//");
    });

    it("returns calendar with no VEVENT blocks for empty events array", () => {
      const ics = generateIcsCalendar([]);
      expect(ics).not.toContain("BEGIN:VEVENT");
      expect(ics).not.toContain("END:VEVENT");
    });

    it("generates one VEVENT block for a single event", () => {
      const ics = generateIcsCalendar([makeEvent()]);
      const beginCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
      const endCount = (ics.match(/END:VEVENT/g) || []).length;
      expect(beginCount).toBe(1);
      expect(endCount).toBe(1);
    });

    it("generates multiple VEVENT blocks for multiple events", () => {
      const events = [
        makeEvent({ uid: "uid-1" }),
        makeEvent({ uid: "uid-2" }),
        makeEvent({ uid: "uid-3" }),
      ];
      const ics = generateIcsCalendar(events);
      const count = (ics.match(/BEGIN:VEVENT/g) || []).length;
      expect(count).toBe(3);
    });

    it("includes CALSCALE and METHOD properties", () => {
      const ics = generateIcsCalendar([]);
      expect(ics).toContain("CALSCALE:GREGORIAN");
      expect(ics).toContain("METHOD:PUBLISH");
    });
  });

  // ----------------------------------------------------------------
  // VEVENT fields
  // ----------------------------------------------------------------
  describe("VEVENT fields", () => {
    it("sets UID correctly", () => {
      const ics = generateIcsCalendar([
        makeEvent({ uid: "my-unique-id@wpm" }),
      ]);
      expect(ics).toContain("UID:my-unique-id@wpm");
    });

    it("sets SUMMARY correctly", () => {
      const ics = generateIcsCalendar([
        makeEvent({ summary: "Annual Inspection" }),
      ]);
      expect(ics).toContain("SUMMARY:Annual Inspection");
    });

    it("escapes commas in SUMMARY", () => {
      const ics = generateIcsCalendar([
        makeEvent({ summary: "Inspection, Repair" }),
      ]);
      expect(ics).toContain("SUMMARY:Inspection\\, Repair");
    });

    it("escapes semicolons in SUMMARY", () => {
      const ics = generateIcsCalendar([
        makeEvent({ summary: "Phase A; Phase B" }),
      ]);
      expect(ics).toContain("SUMMARY:Phase A\\; Phase B");
    });

    it("escapes newlines in SUMMARY", () => {
      const ics = generateIcsCalendar([
        makeEvent({ summary: "Line1\nLine2" }),
      ]);
      expect(ics).toContain("SUMMARY:Line1\\nLine2");
    });

    it("escapes backslashes in SUMMARY", () => {
      const ics = generateIcsCalendar([
        makeEvent({ summary: "Path\\File" }),
      ]);
      expect(ics).toContain("SUMMARY:Path\\\\File");
    });

    it("escapes special characters in DESCRIPTION", () => {
      const ics = generateIcsCalendar([
        makeEvent({ description: "Notes: line1\nline2; extra, info" }),
      ]);
      expect(ics).toContain(
        "DESCRIPTION:Notes: line1\\nline2\\; extra\\, info"
      );
    });

    it("formats DTSTART as VALUE=DATE (YYYYMMDD) for all-day events", () => {
      const ics = generateIcsCalendar([
        makeEvent({ dtstart: new Date("2026-03-20T00:00:00Z") }),
      ]);
      expect(ics).toContain("DTSTART;VALUE=DATE:20260320");
    });

    it("formats DTEND as VALUE=DATE when provided", () => {
      const ics = generateIcsCalendar([
        makeEvent({
          dtstart: new Date("2026-03-20T00:00:00Z"),
          dtend: new Date("2026-03-22T00:00:00Z"),
        }),
      ]);
      expect(ics).toContain("DTEND;VALUE=DATE:20260322");
    });

    it("omits DTEND when not provided", () => {
      const ics = generateIcsCalendar([
        makeEvent({ dtend: undefined }),
      ]);
      expect(ics).not.toContain("DTEND");
    });

    it("includes DTSTAMP in UTC format", () => {
      const ics = generateIcsCalendar([makeEvent()]);
      // With fake timer set to 2026-01-15T12:00:00Z
      expect(ics).toContain("DTSTAMP:20260115T120000Z");
    });
  });

  // ----------------------------------------------------------------
  // VALARM (reminders)
  // ----------------------------------------------------------------
  describe("VALARM reminders", () => {
    it("generates VALARM block for alarmDaysBefore", () => {
      const ics = generateIcsCalendar([
        makeEvent({ alarmDaysBefore: [7] }),
      ]);
      expect(ics).toContain("BEGIN:VALARM");
      expect(ics).toContain("TRIGGER:-P7D");
      expect(ics).toContain("ACTION:DISPLAY");
      expect(ics).toContain("END:VALARM");
    });

    it("generates two VALARM blocks for alarmDaysBefore: [30, 7]", () => {
      const ics = generateIcsCalendar([
        makeEvent({ alarmDaysBefore: [30, 7] }),
      ]);
      const alarmCount = (ics.match(/BEGIN:VALARM/g) || []).length;
      expect(alarmCount).toBe(2);
      expect(ics).toContain("TRIGGER:-P30D");
      expect(ics).toContain("TRIGGER:-P7D");
    });

    it("generates no VALARM when alarmDaysBefore is undefined", () => {
      const ics = generateIcsCalendar([
        makeEvent({ alarmDaysBefore: undefined }),
      ]);
      expect(ics).not.toContain("BEGIN:VALARM");
    });

    it("generates no VALARM when alarmDaysBefore is empty array", () => {
      const ics = generateIcsCalendar([
        makeEvent({ alarmDaysBefore: [] }),
      ]);
      expect(ics).not.toContain("BEGIN:VALARM");
    });

    it("includes reminder description with event summary", () => {
      const ics = generateIcsCalendar([
        makeEvent({
          summary: "Contract Deadline",
          alarmDaysBefore: [14],
        }),
      ]);
      expect(ics).toContain("DESCRIPTION:Erinnerung: Contract Deadline");
    });
  });

  // ----------------------------------------------------------------
  // Edge cases
  // ----------------------------------------------------------------
  describe("edge cases", () => {
    it("folds long lines at 75 characters (RFC 5545)", () => {
      const longDescription = "A".repeat(200);
      const ics = generateIcsCalendar([
        makeEvent({ description: longDescription }),
      ]);

      // The DESCRIPTION line should be folded — continuation lines start with a space
      const lines = ics.split("\r\n");
      const descLineIndex = lines.findIndex((l) =>
        l.startsWith("DESCRIPTION:")
      );
      expect(descLineIndex).toBeGreaterThan(-1);

      // The first line should be max 75 chars
      expect(lines[descLineIndex].length).toBeLessThanOrEqual(75);

      // Next line should be a continuation (starts with space)
      expect(lines[descLineIndex + 1]).toMatch(/^ /);
    });

    it("does not fold short lines", () => {
      const ics = generateIcsCalendar([
        makeEvent({ description: "Short" }),
      ]);
      const lines = ics.split("\r\n");
      const descLine = lines.find((l) => l.startsWith("DESCRIPTION:"));
      expect(descLine).toBe("DESCRIPTION:Short");
    });

    it("includes categories as comma-separated values", () => {
      const ics = generateIcsCalendar([
        makeEvent({ categories: ["Vertrag", "Pacht"] }),
      ]);
      expect(ics).toContain("CATEGORIES:Vertrag,Pacht");
    });

    it("escapes special characters in categories", () => {
      const ics = generateIcsCalendar([
        makeEvent({ categories: ["Wind, Solar", "Pacht; Miete"] }),
      ]);
      expect(ics).toContain("CATEGORIES:Wind\\, Solar,Pacht\\; Miete");
    });

    it("omits CATEGORIES when not provided", () => {
      const ics = generateIcsCalendar([
        makeEvent({ categories: undefined }),
      ]);
      expect(ics).not.toContain("CATEGORIES:");
    });

    it("omits CATEGORIES when array is empty", () => {
      const ics = generateIcsCalendar([
        makeEvent({ categories: [] }),
      ]);
      expect(ics).not.toContain("CATEGORIES:");
    });

    it("includes LOCATION when provided", () => {
      const ics = generateIcsCalendar([
        makeEvent({ location: "Windpark Nordsee" }),
      ]);
      expect(ics).toContain("LOCATION:Windpark Nordsee");
    });

    it("escapes special characters in LOCATION", () => {
      const ics = generateIcsCalendar([
        makeEvent({ location: "Halle A, Raum 3; EG" }),
      ]);
      expect(ics).toContain("LOCATION:Halle A\\, Raum 3\\; EG");
    });

    it("omits LOCATION when not provided", () => {
      const ics = generateIcsCalendar([makeEvent()]);
      expect(ics).not.toContain("LOCATION:");
    });

    it("omits DESCRIPTION when not provided", () => {
      const ics = generateIcsCalendar([
        makeEvent({ description: undefined }),
      ]);
      expect(ics).not.toContain("DESCRIPTION:");
    });

    it("uses CRLF line endings throughout (RFC 5545)", () => {
      const ics = generateIcsCalendar([makeEvent()]);
      // Split by \r\n and rejoin — should be identical to original
      const normalized = ics.split("\r\n").join("\r\n");
      expect(ics).toBe(normalized);
      // And the output should actually contain \r\n
      expect(ics).toContain("\r\n");
    });
  });
});
