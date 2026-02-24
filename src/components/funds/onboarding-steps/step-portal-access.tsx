"use client";

import { useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Shield, Mail } from "lucide-react";
import type { PortalAccessData, PersonalData } from "../onboarding-types";

interface StepPortalAccessProps {
  data: PortalAccessData;
  personalData: PersonalData;
  onChange: (data: PortalAccessData) => void;
}

export function StepPortalAccess({ data, personalData, onChange }: StepPortalAccessProps) {
  // Auto-generate username from email
  useEffect(() => {
    if (personalData.email && data.createPortalAccess) {
      onChange({ ...data, username: personalData.email });
    }
  }, [personalData.email]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleTogglePortalAccess(checked: boolean) {
    onChange({
      ...data,
      createPortalAccess: checked,
      username: checked ? personalData.email : "",
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Portal-Zugang</h3>
        <p className="text-sm text-muted-foreground">
          Optionaler Zugang zum Gesellschafterportal. Der Gesellschafter kann dort
          Dokumente einsehen, an Abstimmungen teilnehmen und Informationen abrufen.
        </p>
      </div>

      {/* Toggle portal access */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="onb-portal-access" className="text-base font-medium cursor-pointer">
              Portal-Zugang erstellen
            </Label>
          </div>
          <p className="text-sm text-muted-foreground">
            Ein Benutzerkonto mit temporaerem Passwort wird erstellt.
          </p>
        </div>
        <Switch
          id="onb-portal-access"
          checked={data.createPortalAccess}
          onCheckedChange={handleTogglePortalAccess}
        />
      </div>

      {data.createPortalAccess && (
        <>
          {/* Email requirement warning */}
          {!personalData.email && (
            <Alert variant="destructive">
              <Info className="h-4 w-4" />
              <AlertDescription>
                Um einen Portal-Zugang zu erstellen, muss eine E-Mail-Adresse
                in den Stammdaten hinterlegt sein. Bitte gehen Sie zurück zu
                Schritt 1 und tragen Sie eine E-Mail-Adresse ein.
              </AlertDescription>
            </Alert>
          )}

          {/* Username field */}
          <div className="space-y-2">
            <Label htmlFor="onb-username">Benutzername (E-Mail-Adresse)</Label>
            <Input
              id="onb-username"
              type="email"
              value={data.username}
              onChange={(e) => onChange({ ...data, username: e.target.value })}
              placeholder="wird aus E-Mail generiert"
              disabled
            />
            <p className="text-xs text-muted-foreground">
              Der Benutzername wird automatisch aus der E-Mail-Adresse generiert.
            </p>
          </div>

          {/* Welcome email toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="onb-welcome-email" className="text-base font-medium cursor-pointer">
                  Willkommens-E-Mail senden
                </Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Eine E-Mail mit den Zugangsdaten wird an den Gesellschafter gesendet.
              </p>
            </div>
            <Switch
              id="onb-welcome-email"
              checked={data.sendWelcomeEmail}
              onCheckedChange={(checked) =>
                onChange({ ...data, sendWelcomeEmail: checked })
              }
            />
          </div>

          {/* Info box */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Nach dem Anlegen wird ein temporaeres Passwort generiert und angezeigt.
              Der Gesellschafter muss das Passwort beim ersten Login aendern.
              {data.sendWelcomeEmail && " Die Zugangsdaten werden zusätzlich per E-Mail versendet."}
            </AlertDescription>
          </Alert>
        </>
      )}
    </div>
  );
}
