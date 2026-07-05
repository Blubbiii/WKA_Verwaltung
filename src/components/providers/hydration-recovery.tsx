"use client";

import React from "react";

/**
 * Auto-recovery for hydration mismatches after deployment.
 *
 * Erkennt React-Minified-Errors #418/#419/#420/#422/#423/#425 (Hydration-Familie)
 * und triggert einen EINMALIGEN reload mit Cache-Bust (?v=<timestamp>).
 *
 * Guard: pro Browser-Session nur einmal (localStorage-Flag `wpm:hydration-recovered`),
 * um Endlos-Loops bei echten Rendering-Bugs zu verhindern.
 */

const RECOVERY_FLAG = "wpm:hydration-recovered";
// Matches "Minified React error #418" / "#419" / "#420" / "#422" / "#423" / "#425".
const HYDRATION_ERROR_RE = /#(41[89]|42[023]|425)/;

function isHydrationError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof Error && typeof err.message === "string") {
    return HYDRATION_ERROR_RE.test(err.message);
  }
  if (typeof err === "string") {
    return HYDRATION_ERROR_RE.test(err);
  }
  return false;
}

interface State {
  recovering: boolean;
  giveUp: boolean;
}

interface Props {
  children: React.ReactNode;
}

export class HydrationRecovery extends React.Component<Props, State> {
  state: State = { recovering: false, giveUp: false };

  static getDerivedStateFromError(error: unknown): Partial<State> | null {
    if (!isHydrationError(error)) return null;
    // Only recover ONCE per session
    if (typeof window !== "undefined") {
      try {
        if (window.localStorage.getItem(RECOVERY_FLAG) === "1") {
          return { recovering: false, giveUp: true };
        }
      } catch {
        // localStorage unavailable → give up gracefully
        return { recovering: false, giveUp: true };
      }
    }
    return { recovering: true, giveUp: false };
  }

  componentDidCatch(error: unknown): void {
    if (!isHydrationError(error)) {
      // Not our problem — rethrow so upstream boundaries can handle it.
      throw error;
    }
    if (this.state.giveUp) return;

    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(RECOVERY_FLAG, "1");
    } catch {
      // ignore quota / private-mode failures
    }

    // Small delay so the fallback UI renders briefly before the reload.
    window.setTimeout(() => {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("v", String(Date.now()));
        window.location.replace(url.toString());
      } catch {
        window.location.reload();
      }
    }, 500);
  }

  render(): React.ReactNode {
    if (this.state.recovering) {
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            fontFamily: "system-ui, sans-serif",
            fontSize: "0.95rem",
            color: "hsl(215, 15%, 55%)",
          }}
        >
          Anwendung wird neu geladen&hellip;
        </div>
      );
    }
    return this.props.children;
  }
}
