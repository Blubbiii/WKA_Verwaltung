"use client";

/**
 * R-11 SEPA-Wizard — Step-Indicator.
 *
 * Horizontale Visualisierung der 4 Schritte. Aktueller Schritt ist primary,
 * abgeschlossene Steps sind muted (Klick → URL-Navigation), zukünftige Steps
 * sind disabled.
 *
 * Klick auf einen abgeschlossenen Step navigiert dorthin — User kann
 * Eingaben korrigieren ohne Daten zu verlieren (state ist in localStorage).
 */

import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

interface StepIndicatorProps {
  currentStep: 1 | 2 | 3 | 4;
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  const t = useTranslations("buchhaltung.sepaWizard");

  const steps = [
    { num: 1 as const, label: t("step1Label") },
    { num: 2 as const, label: t("step2Label") },
    { num: 3 as const, label: t("step3Label") },
    { num: 4 as const, label: t("step4Label") },
  ];

  return (
    <nav
      aria-label={t("stepIndicatorAria")}
      className="flex items-center gap-2 sm:gap-4"
    >
      {steps.map((step, idx) => {
        const isDone = step.num < currentStep;
        const isCurrent = step.num === currentStep;
        const isFuture = step.num > currentStep;

        const dot = (
          <div
            className={cn(
              "h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium border transition-colors",
              isDone && "bg-primary text-primary-foreground border-primary",
              isCurrent && "bg-primary/15 text-primary border-primary",
              isFuture && "bg-muted text-muted-foreground border-border",
            )}
            aria-current={isCurrent ? "step" : undefined}
          >
            {isDone ? <Check className="h-3.5 w-3.5" aria-hidden /> : step.num}
          </div>
        );

        const label = (
          <span
            className={cn(
              "text-xs sm:text-sm font-medium hidden sm:inline",
              isDone && "text-foreground",
              isCurrent && "text-foreground",
              isFuture && "text-muted-foreground",
            )}
          >
            {step.label}
          </span>
        );

        const stepBody = (
          <div className="flex items-center gap-2">
            {dot}
            {label}
          </div>
        );

        return (
          <div key={step.num} className="flex items-center gap-2 sm:gap-4">
            {isDone ? (
              <Link
                href={`/buchhaltung/sepa/new/step-${step.num}`}
                className="rounded-md hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label={t("goBackToStep", { num: step.num, label: step.label })}
              >
                {stepBody}
              </Link>
            ) : (
              stepBody
            )}
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  "h-px w-6 sm:w-12 transition-colors",
                  isDone ? "bg-primary" : "bg-border",
                )}
                aria-hidden
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
