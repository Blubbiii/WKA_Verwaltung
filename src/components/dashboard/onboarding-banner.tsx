"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Shield, CheckCircle2, Circle, Wind, Building2, Zap, Radio, Users, X } from "lucide-react";
import Link from "next/link";
import { onboardingAnzeige } from "@/lib/dashboard/onboarding-anzeige";

interface OnboardingStep {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: typeof Wind;
  completed: boolean;
}

function getInitialDismissed(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("wpm:onboarding-dismissed") === "true";
}

export function OnboardingBanner() {
  const t = useTranslations("dashboard.onboardingBanner");
  const [steps, setSteps] = useState<OnboardingStep[] | null>(null);
  const [dismissed, setDismissed] = useState(getInitialDismissed);

  useEffect(() => {
    if (dismissed) return;

    fetch("/api/admin/onboarding-status")
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data?.steps) return;
        const s = data.steps;
        setSteps([
          { key: "park", label: t("stepPark"), description: t("stepParkDesc"), href: "/parks/new", icon: Wind, completed: !!s.park },
          { key: "fund", label: t("stepFund"), description: t("stepFundDesc"), href: "/funds/new", icon: Building2, completed: !!s.fund },
          { key: "turbine", label: t("stepTurbine"), description: t("stepTurbineDesc"), href: "/parks", icon: Zap, completed: !!s.turbine },
          { key: "scada", label: t("stepScada"), description: t("stepScadaDesc"), href: "/energy/scada", icon: Radio, completed: !!s.scada },
          { key: "invite", label: t("stepInvite"), description: t("stepInviteDesc"), href: "/admin/roles", icon: Users, completed: !!s.invite },
        ]);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (dismissed || !steps) return null;

  const completedCount = steps.filter(s => s.completed).length;
  const progressPct = (completedCount / steps.length) * 100;
  const anzeige = onboardingAnzeige(completedCount, steps.length);

  // Hide when all steps are done
  if (anzeige === "aus") return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("wpm:onboarding-dismissed", "true");
  };

  // Almost done: one line instead of a third of the dashboard.
  if (anzeige === "kompakt") {
    const naechster = steps.find((step) => !step.completed);
    return (
      <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-sm">
        <Shield className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
        <span className="text-muted-foreground">
          {t("progress", { completed: completedCount, total: steps.length })}
        </span>
        {naechster && (
          <Link href={naechster.href} className="font-medium text-primary hover:underline">
            {t("nextStep", { step: naechster.label })}
          </Link>
        )}
        <Button aria-label={t("dismiss")} variant="ghost" size="icon" onClick={handleDismiss} className="ml-auto h-7 w-7 text-muted-foreground">
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2.5">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">{t("title")}</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t("progress", { completed: completedCount, total: steps.length })}
              </p>
            </div>
          </div>
          <Button aria-label={t("dismiss")} variant="ghost" size="icon" onClick={handleDismiss} className="h-8 w-8 text-muted-foreground">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Progress value={progressPct} className="h-1.5 mt-3" />
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {steps.map((step) => (
            <Link
              key={step.key}
              href={step.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                step.completed
                  ? "text-muted-foreground"
                  : "hover:bg-primary/5 text-foreground"
              }`}
            >
              {step.completed ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <span className={step.completed ? "line-through" : "font-medium"}>
                  {step.label}
                </span>
                {!step.completed && (
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                )}
              </div>
              {!step.completed && (
                <step.icon className="h-4 w-4 text-primary/50 shrink-0" />
              )}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
