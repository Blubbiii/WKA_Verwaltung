/**
 * PII masking helpers for Sentry beforeSend hooks (DSGVO Art. 5).
 *
 * - mask emails: keep domain, hide local part
 * - mask IPs: keep first 2 octets (geo correlation), hide host
 * - mask IBAN/BIC: hide full value
 */

export function maskEmail(value: string | null | undefined): string | undefined {
  if (!value || typeof value !== "string") return undefined;
  const at = value.indexOf("@");
  if (at <= 0) return "***";
  return `***@${value.slice(at + 1)}`;
}

export function maskIp(value: string | null | undefined): string | undefined {
  if (!value || typeof value !== "string") return undefined;
  // IPv4
  const v4 = value.match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.x.x`;
  // IPv6 → keep first hextet
  if (value.includes(":")) {
    const first = value.split(":")[0];
    return `${first}:x:x:x:x:x:x:x`;
  }
  return "x.x.x.x";
}

const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g;
const BIC_RE = /\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?\b/g;

export function maskFinancialIdentifiers(text: string): string {
  return text.replace(IBAN_RE, "IBAN-***").replace(BIC_RE, "BIC-***");
}
