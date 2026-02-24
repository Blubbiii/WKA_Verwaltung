"use client";

import { useState } from "react";
import { Settings2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { DashboardEditor, DashboardView, OnboardingBanner } from "@/components/dashboard";
import { useDashboardConfig } from "@/hooks/useDashboardConfig";

// =============================================================================
// DASHBOARD PAGE COMPONENT
// =============================================================================

export default function DashboardPage() {
  const [isEditing, setIsEditing] = useState(false);
  const { error, refetch, isLoading } = useDashboardConfig();

  const handleStartEditing = () => {
    setIsEditing(true);
  };

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
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            {isEditing
              ? "Passen Sie Ihr Dashboard an"
              : "Willkommen zurück! Hier ist Ihre Übersicht."}
          </p>
        </div>

        {!isEditing && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCcw
                className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
              Aktualisieren
            </Button>
            <Button variant="outline" size="sm" onClick={handleStartEditing}>
              <Settings2 className="mr-2 h-4 w-4" />
              Dashboard anpassen
            </Button>
          </div>
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
        <DashboardView onEdit={handleStartEditing} />
      )}
    </div>
  );
}
