"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { DashboardEditor, DashboardView, OnboardingBanner } from "@/components/dashboard";
import { ParkHealthPulse } from "@/components/dashboard/ParkHealthPulse";
import { DashboardGreeting } from "@/components/dashboard/greeting";
import { useDashboardConfig } from "@/hooks/useDashboardConfig";

// =============================================================================
// DASHBOARD PAGE COMPONENT
// =============================================================================

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const editParam = searchParams.get("edit") === "true";
  const [isEditing, setIsEditing] = useState(editParam);
  const { error, refetch, isLoading } = useDashboardConfig();

  // Clean up URL after entering edit mode via query param
  if (editParam && typeof window !== "undefined") {
    router.replace("/dashboard", { scroll: false });
  }

  const handleStopEditing = () => {
    setIsEditing(false);
  };

  const handleSaveComplete = () => {
    setIsEditing(false);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {isEditing ? (
            <>
              <h1 className="text-3xl font-bold tracking-tight">Dashboard anpassen</h1>
              <p className="text-muted-foreground">Widgets hinzufügen, entfernen und anordnen</p>
            </>
          ) : (
            <DashboardGreeting />
          )}
        </div>

        {!isEditing && (
          <Button
            data-tour="dashboard-customize"
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isLoading}
            title="Dashboard aktualisieren"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <RefreshCcw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        )}
      </div>

      {/* Onboarding Banner (shown when tenant has no parks/funds) */}
      {!isEditing && <OnboardingBanner />}

      {/* Error Alert (only in view mode) */}
      {error && !isEditing && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription>
            {error}
            <Button
              variant="link"
              size="sm"
              onClick={() => refetch()}
              className="ml-2 p-0 h-auto"
            >
              Erneut versuchen
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Dashboard Content */}
      {isEditing ? (
        <DashboardEditor onSave={handleSaveComplete} onCancel={handleStopEditing} />
      ) : (
        <>
          <ParkHealthPulse />
          <DashboardView onEdit={() => setIsEditing(true)} />
        </>
      )}
    </div>
  );
}
