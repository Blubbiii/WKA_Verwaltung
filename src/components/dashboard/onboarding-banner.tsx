"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Shield, CheckCircle2, Circle, Wind, Building2, Zap, Radio, Users, X } from "lucide-react";
import Link from "next/link";

interface OnboardingStep {
  key: string;
  label: string;
  description: string;
  href: string;
  icon: typeof Wind;
  completed: boolean;
}

export function OnboardingBanner() {
  const [steps, setSteps] = useState<OnboardingStep[] | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if user dismissed the banner
    const wasDismissed = localStorage.getItem("wpm:onboarding-dismissed");
    if (wasDismissed === "true") {
      setDismissed(true);
      return;
    }

    fetch("/api/admin/onboarding-status")
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data?.steps) return;
        const s = data.steps;
        setSteps([
          { key: "park", label: "Windpark anlegen", description: "Erstellen Sie Ihren ersten Windpark", href: "/parks/new", icon: Wind, completed: !!s.park },
          { key: "fund", label: "Gesellschaft anlegen", description: "Legen Sie eine Betreibergesellschaft an", href: "/funds/new", icon: Building2, completed: !!s.fund },
          { key: "turbine", label: "Anlage hinzufuegen", description: "Fuegen Sie Turbinen zu Ihrem Park hinzu", href: "/parks", icon: Zap, completed: !!s.turbine },
          { key: "scada", label: "Ertragsdaten verbinden", description: "Importieren Sie SCADA- oder Produktionsdaten", href: "/energy/scada", icon: Radio, completed: !!s.scada },
          { key: "invite", label: "Gesellschafter einladen", description: "Laden Sie weitere Benutzer ein", href: "/admin/roles", icon: Users, completed: !!s.invite },
        ]);
      })
      .catch(() => {});
  }, []);

  if (dismissed || !steps) return null;

  const completedCount = steps.filter(s => s.completed).length;
  const allDone = completedCount === steps.length;
  const progressPct = (completedCount / steps.length) * 100;

  // Hide when all steps are done
  if (allDone) return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("wpm:onboarding-dismissed", "true");
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2.5">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Erste Schritte</CardTitle>
              <p className="text-sm text-muted-foreground mt-0.5">
                {completedCount} von {steps.length} abgeschlossen
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={handleDismiss} className="h-8 w-8 text-muted-foreground">
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
