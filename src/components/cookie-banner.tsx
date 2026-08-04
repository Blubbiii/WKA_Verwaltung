"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const COOKIE_CONSENT_KEY = "wpm-cookie-consent";
// Erhöhe diese Version wenn Banner-Texte oder Cookie-Policy sich ändern
// → User wird neu gefragt + neuer ConsentLog-Entry mit dieser Version
const CONSENT_VERSION = "1.0";

export function CookieBanner() {
  const t = useTranslations("cookieBanner");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only show if user hasn't already acknowledged THIS version
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent || consent !== CONSENT_VERSION) {
      setTimeout(() => setVisible(true), 0);
    }
  }, []);

  async function handleAccept() {
    localStorage.setItem(COOKIE_CONSENT_KEY, CONSENT_VERSION);
    setVisible(false);

    // DSGVO Art. 7: Einwilligung audit-fähig persistieren.
    // Fire-and-forget — der Banner wird sofort geschlossen, auch wenn
    // die API-Write fehlschlägt (UX vs. strikte Compliance-Trade-off;
    // der localStorage ist das Primary-Signal).
    try {
      const sessionId =
        localStorage.getItem("wpm-anon-session") ||
        crypto.randomUUID();
      localStorage.setItem("wpm-anon-session", sessionId);

      await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consentType: "cookies_necessary",
          given: true,
          version: CONSENT_VERSION,
          sessionId,
        }),
      });
    } catch {
      // Non-blocking — log-write failure should not affect user journey
    }
  }

  if (!visible) return null;

  return (
    /*
      `pointer-events-none` auf dem Rahmen, `pointer-events-auto` auf der Karte.

      Der Rahmen geht ueber die volle Breite und den vollen Innenabstand, die
      Karte ist auf `max-w-4xl` begrenzt. Ohne diese Trennung fing der Rahmen
      auch dort Klicks ab, wo gar nichts zu sehen ist — links und rechts neben
      der Karte, ueber die ganze untere Leiste hinweg.

      Getroffen hat das jede Ansicht mit einer festen Fussleiste: in den
      Assistenten sitzt „Weiter" unten rechts. Der Knopf war sichtbar, nicht
      ausgegraut, reagierte aber auf keinen Klick. Wer den Hinweis nicht zuerst
      wegklickt — und er sieht nicht so aus, als versperre er etwas — kommt im
      Assistenten keinen Schritt weiter und erfaehrt nicht, warum.
    */
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6">
      <div className="pointer-events-auto mx-auto max-w-4xl rounded-lg border bg-card p-4 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="flex-1 text-sm text-muted-foreground">
            <p>
              {t.rich("text", {
                tech: (chunks) => (
                  <strong className="text-foreground">{chunks}</strong>
                ),
              })}{" "}
              <Link
                href="/cookies"
                className="underline underline-offset-2 hover:text-foreground"
              >
                {t("learnMore")}
              </Link>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" onClick={handleAccept}>
              {t("accept")}
            </Button>
            <button
              onClick={handleAccept}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground"
              aria-label={t("close")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
