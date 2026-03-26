"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const COOKIE_CONSENT_KEY = "wpm-cookie-consent";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show if user hasn't already acknowledged
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      setTimeout(() => setVisible(true), 0);
    }
  }, []);

  function handleAccept() {
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6">
      <div className="mx-auto max-w-4xl rounded-lg border bg-card p-4 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="flex-1 text-sm text-muted-foreground">
            <p>
              Diese Website verwendet ausschliesslich{" "}
              <strong className="text-foreground">technisch notwendige Cookies</strong>{" "}
              fuer die Anmeldung und Sitzungsverwaltung. Es werden keine
              Tracking- oder Werbe-Cookies gesetzt.{" "}
              <Link
                href="/cookies"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Mehr erfahren
              </Link>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" onClick={handleAccept}>
              Verstanden
            </Button>
            <button
              onClick={handleAccept}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground"
              aria-label="Schliessen"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
