/**
 * Simple merge-field renderer for CRM email templates.
 *
 * Supports `{{person.firstName}}`, `{{person.lastName}}`, `{{person.companyName}}`,
 * `{{person.email}}`, `{{person.salutation}}`, `{{tenant.name}}`, and
 * `{{today}}`. Missing keys are replaced with an empty string so a typo
 * cannot break the output.
 */

export interface TemplateContext {
  person?: {
    firstName?: string | null;
    lastName?: string | null;
    salutation?: string | null;
    companyName?: string | null;
    email?: string | null;
  };
  tenant?: {
    name?: string | null;
  };
}

function formatToday(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function getValue(path: string, ctx: TemplateContext): string {
  const segments = path.split(".");
  // Top-level tokens
  if (segments.length === 1) {
    if (segments[0] === "today") return formatToday();
  }
  // Nested tokens (person.firstName etc.)
  if (segments.length === 2) {
    const [obj, key] = segments;
    const bag = (ctx as unknown as Record<string, Record<string, string | null | undefined>>)[obj];
    if (bag && bag[key] != null) return String(bag[key]);
  }
  return "";
}

/**
 * Replace `{{key}}` and `{{obj.key}}` in the input string using the given context.
 */
export function renderTemplate(input: string, ctx: TemplateContext): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, path: string) =>
    getValue(path, ctx),
  );
}

/**
 * List of supported merge field tokens (for UI help text).
 */
export const SUPPORTED_TOKENS = [
  "{{person.salutation}}",
  "{{person.firstName}}",
  "{{person.lastName}}",
  "{{person.companyName}}",
  "{{person.email}}",
  "{{tenant.name}}",
  "{{today}}",
];
