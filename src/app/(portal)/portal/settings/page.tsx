"use client";

import { useState } from "react";
import {
  Bell,
  Globe,
  Shield,
  Lock,
  Mail,
  FileText,
  Wallet,
  Vote,
  Info,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function SettingsPage() {
  // Notification settings (placeholder state - not persisted)
  const [notifications, setNotifications] = useState({
    newVote: true,
    newDistribution: true,
    newDocument: false,
  });

  // Mock last login date
  const lastLogin = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

  function formatDate(date: Date): string {
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Einstellungen</h1>
        <p className="text-muted-foreground">
          Verwalten Sie Ihre Benachrichtigungen und Kontoeinstellungen
        </p>
      </div>

      {/* Notifications Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Benachrichtigungen
          </CardTitle>
          <CardDescription>
            Legen Sie fest, worüber Sie per E-Mail informiert werden möchten
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Info Alert */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              E-Mail-Benachrichtigungen werden in einer zukuenftigen Version aktiviert.
              Sie können Ihre Praeferenzen bereits jetzt festlegen.
            </AlertDescription>
          </Alert>

          {/* Notification Options */}
          <div className="space-y-4">
            {/* New Vote Notification */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100">
                  <Vote className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <Label htmlFor="notify-vote" className="text-base font-medium">
                    Neue Abstimmung
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Benachrichtigung bei neuen Gesellschafterbeschluessen
                  </p>
                </div>
              </div>
              <Switch
                id="notify-vote"
                checked={notifications.newVote}
                onCheckedChange={(checked) =>
                  setNotifications((prev) => ({ ...prev, newVote: checked }))
                }
                disabled
              />
            </div>

            {/* New Distribution Notification */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                  <Wallet className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <Label htmlFor="notify-distribution" className="text-base font-medium">
                    Neue Ausschuettung
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Benachrichtigung bei neuen Gutschriften
                  </p>
                </div>
              </div>
              <Switch
                id="notify-distribution"
                checked={notifications.newDistribution}
                onCheckedChange={(checked) =>
                  setNotifications((prev) => ({ ...prev, newDistribution: checked }))
                }
                disabled
              />
            </div>

            {/* New Document Notification */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <Label htmlFor="notify-document" className="text-base font-medium">
                    Neues Dokument
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Benachrichtigung bei neuen Dokumenten im Portal
                  </p>
                </div>
              </div>
              <Switch
                id="notify-document"
                checked={notifications.newDocument}
                onCheckedChange={(checked) =>
                  setNotifications((prev) => ({ ...prev, newDocument: checked }))
                }
                disabled
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Display Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Anzeige-Einstellungen
          </CardTitle>
          <CardDescription>
            Sprache und Währungseinstellungen für das Portal
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Language */}
            <div className="space-y-2">
              <Label className="text-muted-foreground">Sprache</Label>
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span>Deutsch</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Die Sprache des Portals ist aktuell auf Deutsch festgelegt
              </p>
            </div>

            {/* Currency */}
            <div className="space-y-2">
              <Label className="text-muted-foreground">Währung</Label>
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                <span className="text-muted-foreground">EUR</span>
                <span>Euro</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Alle Betraege werden in Euro angezeigt
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Sicherheit
          </CardTitle>
          <CardDescription>
            Verwalten Sie Ihre Zugangsdaten und Sicherheitseinstellungen
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Password Change */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                <Lock className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-base font-medium">Passwort aendern</p>
                <p className="text-sm text-muted-foreground">
                  Aktualisieren Sie Ihr Anmeldepasswort
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Button variant="outline" disabled>
                Passwort aendern
              </Button>
              <span className="text-xs text-muted-foreground">Funktion folgt</span>
            </div>
          </div>

          {/* Last Login */}
          <div className="border-t pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <Mail className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-base font-medium">Letzte Anmeldung</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(lastLogin)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
