"use client";

import { useState } from "react";
import {
  Loader2,
  Shield,
  Copy,
  Check,
  AlertTriangle,
  UserPlus,
  UserMinus,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

// =====================
// Types
// =====================

interface PortalAccessShareholder {
  id: string;
  person: {
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
    personType: "natural" | "legal";
    email: string | null;
  };
}

interface PortalAccessCreateResponse {
  email: string;
  temporaryPassword: string;
  emailSent?: boolean;
}

// =====================
// Create Portal Access Dialog
// =====================

interface CreatePortalAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareholder: PortalAccessShareholder | null;
  onSuccess: (result: PortalAccessCreateResponse) => void;
  onRefresh: () => void;
}

function getPersonName(person: PortalAccessShareholder["person"]): string {
  if (person.personType === "legal") {
    return person.companyName || "-";
  }
  return [person.firstName, person.lastName].filter(Boolean).join(" ") || "-";
}

export function CreatePortalAccessDialog({
  open,
  onOpenChange,
  shareholder,
  onSuccess,
  onRefresh,
}: CreatePortalAccessDialogProps) {
  const [isCreating, setIsCreating] = useState(false);

  async function handleCreate() {
    if (!shareholder) return;

    try {
      setIsCreating(true);
      const response = await fetch(
        `/api/shareholders/${shareholder.id}/portal-access`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Erstellen des Portal-Zugangs");
      }

      const data = await response.json();
      const result: PortalAccessCreateResponse = {
        email: data.user?.email || data.email,
        temporaryPassword: data.temporaryPassword,
        emailSent: data.emailSent,
      };
      toast.success(
        result.emailSent
          ? "Portal-Zugang erstellt. Zugangsdaten wurden per E-Mail versendet."
          : "Portal-Zugang erfolgreich erstellt"
      );
      onOpenChange(false);
      onSuccess(result);
      onRefresh();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Fehler beim Erstellen des Portal-Zugangs"
      );
    } finally {
      setIsCreating(false);
    }
  }

  if (!shareholder) return null;

  const name = getPersonName(shareholder.person);
  const email = shareholder.person.email;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Portal-Zugang erstellen
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Fuer <span className="font-semibold text-foreground">{name}</span> wird
                ein Portal-Benutzerkonto erstellt. Die Zugangsdaten werden angezeigt.
              </p>
              {email ? (
                <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">E-Mail-Adresse: </span>
                  <span className="font-medium text-foreground">{email}</span>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Dieser Gesellschafter hat keine E-Mail-Adresse hinterlegt.
                    Bitte ergaenzen Sie die E-Mail-Adresse zuerst in den Personendaten.
                  </span>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isCreating}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleCreate();
            }}
            disabled={isCreating || !email}
          >
            {isCreating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Shield className="mr-2 h-4 w-4" />
            )}
            {isCreating ? "Wird erstellt..." : "Zugang erstellen"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// =====================
// Remove Portal Access Dialog
// =====================

interface RemovePortalAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shareholder: PortalAccessShareholder | null;
  onRefresh: () => void;
}

export function RemovePortalAccessDialog({
  open,
  onOpenChange,
  shareholder,
  onRefresh,
}: RemovePortalAccessDialogProps) {
  const [isRemoving, setIsRemoving] = useState(false);

  async function handleRemove() {
    if (!shareholder) return;

    try {
      setIsRemoving(true);
      const response = await fetch(
        `/api/shareholders/${shareholder.id}/portal-access`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Entfernen des Portal-Zugangs");
      }

      toast.success("Portal-Zugang entfernt");
      onOpenChange(false);
      onRefresh();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Fehler beim Entfernen des Portal-Zugangs"
      );
    } finally {
      setIsRemoving(false);
    }
  }

  if (!shareholder) return null;

  const name = getPersonName(shareholder.person);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <UserMinus className="h-5 w-5" />
            Portal-Zugang entfernen
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Moechten Sie den Portal-Zugang fuer{" "}
                <span className="font-semibold text-foreground">{name}</span>{" "}
                wirklich entfernen?
              </p>
              <p className="text-destructive font-medium">
                Der Gesellschafter kann sich danach nicht mehr im Portal anmelden.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRemoving}>Abbrechen</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleRemove();
            }}
            disabled={isRemoving}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isRemoving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserMinus className="mr-2 h-4 w-4" />
            )}
            {isRemoving ? "Wird entfernt..." : "Zugang entfernen"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// =====================
// Password Display Dialog
// =====================

interface PasswordDisplayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  credentials: PortalAccessCreateResponse | null;
}

export function PasswordDisplayDialog({
  open,
  onOpenChange,
  credentials,
}: PasswordDisplayDialogProps) {
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [copiedPassword, setCopiedPassword] = useState(false);

  async function copyToClipboard(text: string, type: "email" | "password") {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "email") {
        setCopiedEmail(true);
        setTimeout(() => setCopiedEmail(false), 2000);
      } else {
        setCopiedPassword(true);
        setTimeout(() => setCopiedPassword(false), 2000);
      }
      toast.success("In die Zwischenablage kopiert");
    } catch {
      toast.error("Kopieren fehlgeschlagen");
    }
  }

  if (!credentials) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-green-600" />
            Portal-Zugang erstellt
          </DialogTitle>
          <DialogDescription>
            Die Zugangsdaten fuer den Gesellschafter wurden erstellt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Email sent success banner */}
          {credentials.emailSent && (
            <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
              <Mail className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Die Zugangsdaten wurden erfolgreich per E-Mail an den
                Gesellschafter versendet.
              </span>
            </div>
          )}

          {/* Email send failed warning */}
          {credentials.emailSent === false && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Die Zugangsdaten konnten nicht per E-Mail versendet werden.
                Bitte teilen Sie die Daten manuell mit.
              </span>
            </div>
          )}

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              E-Mail-Adresse
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-sm">
                {credentials.email}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(credentials.email, "email")}
                aria-label="E-Mail kopieren"
              >
                {copiedEmail ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">
              Temporaeres Passwort
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 rounded-md border bg-muted px-3 py-2 font-mono text-sm">
                {credentials.temporaryPassword}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  copyToClipboard(credentials.temporaryPassword, "password")
                }
                aria-label="Passwort kopieren"
              >
                {copiedPassword ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Info note */}
          {!credentials.emailSent && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Bitte teilen Sie diese Zugangsdaten dem Gesellschafter mit.
                Das Passwort kann nur einmal angezeigt werden.
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Schliessen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
