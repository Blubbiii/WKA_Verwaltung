"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

interface Props {
  children: React.ReactNode;
}

// Redesign 2026-06: Dark als Standard. System-Preference bleibt verfügbar (über UI-Toggle),
// aber bei erstmaligem Besuch landet der User im dunklen Theme. Konstruktive Ruhe + bessere
// Wahrnehmung der Currency-Tabellen + Brand-Stimmung "modern·präzise·zugänglich" passt zu dunklem
// Default. Wer aktiv hell wählt, dem bleibt seine Wahl über localStorage erhalten.
export function ThemeProvider({ children }: Props) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      storageKey="theme"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
