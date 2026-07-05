/**
 * Zentrale Design-Tokens für alle PDF-Templates.
 *
 * Ersetzt die früher pro-Template duplizierten `const C = { ... }` Blöcke
 * (14 Templates × je ~25 Farben = ~350 duplizierte Werte).
 *
 * Bei Brand-Farbwechseln nur diese Datei anfassen.
 */
export const PDF_COLORS = {
  // Brand — Warm Navy
  navy: "#1E3A5F",
  navyLight: "#335E99",
  navyPale: "#E8EEF5",
  navyDark: "#142940",

  // Semantic
  green: "#16A34A",
  greenLight: "#DCFCE7",
  amber: "#D97706",
  amberLight: "#FEF3C7",
  red: "#DC2626",
  redLight: "#FEE2E2",
  blue: "#2563EB",
  blueLight: "#DBEAFE",

  // Neutrals
  white: "#FFFFFF",
  gray50: "#F9FAFB",
  gray100: "#F3F4F6",
  gray200: "#E5E7EB",
  gray300: "#D1D5DB",
  gray400: "#9CA3AF",
  gray500: "#6B7280",
  gray600: "#4B5563",
  gray700: "#374151",
  gray800: "#1F2937",
  gray900: "#111827",
} as const;

export type PdfColor = keyof typeof PDF_COLORS;
