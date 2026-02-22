"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";

// =============================================================================
// Onboarding Banner Component
// Shown on the dashboard when the tenant has no parks AND no funds.
// =============================================================================

export function OnboardingBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    async function checkOnboarding() {
      try {
        const res = await fetch("/api/admin/onboarding-status");
        if (!res.ok) return;

        const data = await res.json();
        // Show banner only if both park and fund are missing
        if (!data.steps?.park && !data.steps?.fund) {
          setShowBanner(true);
        }
      } catch {
        // Silently ignore - banner just won't show if request fails
        // (e.g. if user is not admin)
      }
    }

    checkOnboarding();
  }, []);

  if (!showBanner) return null;

  return (
    <div className="mb-6 rounded-lg border-2 border-primary/20 bg-primary/5 p-6">
      <div className="flex items-start gap-4">
        <div className="rounded-full bg-primary/10 p-3 shrink-0">
          <Rocket className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">
            Willkommen bei WindparkManager!
          </h2>
          <p className="text-muted-foreground mt-1">
            Ihr Mandant ist noch nicht eingerichtet. Starten Sie den
            Einrichtungsassistenten, um Ihren ersten Windpark und Ihre erste
            Gesellschaft anzulegen.
          </p>
          <Button className="mt-4" asChild>
            <Link href="/setup">Einrichtung starten</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
