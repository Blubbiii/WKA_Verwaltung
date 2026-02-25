/**
 * ICS/iCalendar Generator
 *
 * Generates RFC 5545 compliant calendar files for
 * contract deadlines and lease dates.
 */

export interface IcsEvent {
  uid: string;
  summary: string;
  description?: string;
  dtstart: Date;
  dtend?: Date;
  /** Alarm triggers in days before event (positive number) */
  alarmDaysBefore?: number[];
  location?: string;
  categories?: string[];
}

/** Format a Date as ICS date string (YYYYMMDD) for all-day events */
function formatIcsDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** Format a Date as ICS date-time string (YYYYMMDDTHHMMSSZ) */
function formatIcsDateTime(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escape special characters in ICS text fields per RFC 5545 */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Fold long lines at 75 characters per RFC 5545 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  parts.push(line.substring(0, 75));
  let rest = line.substring(75);
  while (rest.length > 0) {
    parts.push(" " + rest.substring(0, 74));
    rest = rest.substring(74);
  }
  return parts.join("\r\n");
}

function buildVEvent(event: IcsEvent): string {
  const lines: string[] = [];
  lines.push("BEGIN:VEVENT");
  lines.push(`UID:${event.uid}`);
  lines.push(`DTSTAMP:${formatIcsDateTime(new Date())}`);

  // All-day events use VALUE=DATE format
  lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(event.dtstart)}`);
  if (event.dtend) {
    lines.push(`DTEND;VALUE=DATE:${formatIcsDate(event.dtend)}`);
  }

  lines.push(`SUMMARY:${escapeIcsText(event.summary)}`);

  if (event.description) {
    lines.push(foldLine(`DESCRIPTION:${escapeIcsText(event.description)}`));
  }

  if (event.location) {
    lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  }

  if (event.categories && event.categories.length > 0) {
    lines.push(`CATEGORIES:${event.categories.map(escapeIcsText).join(",")}`);
  }

  // Add VALARM reminders
  if (event.alarmDaysBefore) {
    for (const days of event.alarmDaysBefore) {
      lines.push("BEGIN:VALARM");
      lines.push(`TRIGGER:-P${days}D`);
      lines.push("ACTION:DISPLAY");
      lines.push(`DESCRIPTION:Erinnerung: ${escapeIcsText(event.summary)}`);
      lines.push("END:VALARM");
    }
  }

  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

/**
 * Generate an ICS calendar string from a list of events.
 */
export function generateIcsCalendar(events: IcsEvent[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WindparkManager//Calendar Export//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:WindparkManager Termine",
  ];

  for (const event of events) {
    lines.push(buildVEvent(event));
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
