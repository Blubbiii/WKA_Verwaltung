"use client";

/**
 * UiStyleProvider — toggles between "classic" and "glass" UI styles.
 *
 * Works orthogonally to next-themes (Light/Dark). The style is persisted in
 * localStorage and applied as a class on <html> ("ui-classic" / "ui-glass").
 *
 * FOUC prevention: An inline blocking script in `app/layout.tsx` reads the
 * stored value and sets the class BEFORE React hydrates. This provider then
 * derives its initial state from the existing DOM class (NOT from localStorage),
 * so server and client always agree.
 */

import { createContext, useContext, useState } from "react";

export type UiStyle = "classic" | "glass";

interface UiStyleContextValue {
  style: UiStyle;
  setStyle: (s: UiStyle) => void;
}

const UiStyleContext = createContext<UiStyleContextValue | null>(null);

export function UiStyleProvider({ children }: { children: React.ReactNode }) {
  // Read initial state from DOM (set by inline script in <head>).
  // SSR: default to "classic" so server HTML is deterministic.
  const [style, setStyleState] = useState<UiStyle>(() => {
    if (typeof window === "undefined") return "classic";
    return document.documentElement.classList.contains("ui-glass")
      ? "glass"
      : "classic";
  });

  const setStyle = (next: UiStyle) => {
    setStyleState(next);
    try {
      localStorage.setItem("ui-style", next);
    } catch {
      // localStorage may be unavailable (private browsing) — ignore
    }
    const html = document.documentElement;
    html.classList.remove("ui-classic", "ui-glass");
    html.classList.add(`ui-${next}`);
  };

  return (
    <UiStyleContext.Provider value={{ style, setStyle }}>
      {children}
    </UiStyleContext.Provider>
  );
}

export function useUiStyle() {
  const ctx = useContext(UiStyleContext);
  if (!ctx) {
    throw new Error("useUiStyle must be used within a UiStyleProvider");
  }
  return ctx;
}
