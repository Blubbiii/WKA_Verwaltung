"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OnboardingWizard } from "@/components/funds/onboarding-wizard";

export default function ShareholderOnboardingPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/funds" aria-label="Zurueck zur Gesellschaftenuebersicht">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Neuer Gesellschafter
          </h1>
          <p className="text-muted-foreground">
            Gesellschafter-Onboarding: Schritt fuer Schritt einen neuen Gesellschafter anlegen.
          </p>
        </div>
      </div>

      {/* Wizard Card */}
      <Card>
        <CardContent className="pt-6">
          <OnboardingWizard />
        </CardContent>
      </Card>
    </div>
  );
}
