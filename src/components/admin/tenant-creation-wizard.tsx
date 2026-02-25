"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  KeyRound,
  SkipForward,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Stepper, StepContent, StepActions } from "@/components/ui/stepper";

// =============================================================================
// Types
// =============================================================================

interface TenantCreationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type AdminMode = "invitation" | "password" | "skip";

interface TenantFormData {
  name: string;
  slug: string;
  contactEmail: string;
  contactPhone: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  primaryColor: string;
  secondaryColor: string;
}

interface AdminFormData {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  passwordConfirm: string;
}

// =============================================================================
// Constants
// =============================================================================

const STEPS = [
  { id: "tenant", title: "Firma", description: "Stammdaten" },
  { id: "admin", title: "Admin", description: "Erstzugang" },
];

const EMPTY_TENANT: TenantFormData = {
  name: "",
  slug: "",
  contactEmail: "",
  contactPhone: "",
  street: "",
  houseNumber: "",
  postalCode: "",
  city: "",
  primaryColor: "#0d9488",
  secondaryColor: "#1e40af",
};

const EMPTY_ADMIN: AdminFormData = {
  email: "",
  firstName: "",
  lastName: "",
  password: "",
  passwordConfirm: "",
};

const SLUG_REGEX = /^[a-z0-9-]+$/;

// =============================================================================
// Helpers
// =============================================================================

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\u00e4/g, "ae")
    .replace(/\u00f6/g, "oe")
    .replace(/\u00fc/g, "ue")
    .replace(/\u00df/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// =============================================================================
// Component
// =============================================================================

export function TenantCreationWizard({
  open,
  onOpenChange,
  onSuccess,
}: TenantCreationWizardProps) {
  // Step state
  const [currentStep, setCurrentStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // Tenant form
  const [tenant, setTenant] = useState<TenantFormData>(EMPTY_TENANT);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  // Admin form
  const [adminMode, setAdminMode] = useState<AdminMode>("invitation");
  const [admin, setAdmin] = useState<AdminFormData>(EMPTY_ADMIN);

  // ──────────────────────────────────────────────────────────────────────────
  // Reset when dialog closes
  // ──────────────────────────────────────────────────────────────────────────

  const resetState = useCallback(() => {
    setCurrentStep(0);
    setIsSaving(false);
    setTenant(EMPTY_TENANT);
    setSlugManuallyEdited(false);
    setAdminMode("invitation");
    setAdmin(EMPTY_ADMIN);
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

  // ──────────────────────────────────────────────────────────────────────────
  // Tenant form handlers
  // ──────────────────────────────────────────────────────────────────────────

  function handleNameChange(name: string) {
    setTenant((prev) => ({
      ...prev,
      name,
      ...(!slugManuallyEdited ? { slug: slugify(name) } : {}),
    }));
  }

  function handleSlugChange(slug: string) {
    setSlugManuallyEdited(true);
    setTenant((prev) => ({ ...prev, slug }));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Validation
  // ──────────────────────────────────────────────────────────────────────────

  function validateTenantStep(): boolean {
    if (!tenant.name.trim()) {
      toast.error("Firmenname ist ein Pflichtfeld");
      return false;
    }
    if (!tenant.slug.trim()) {
      toast.error("Slug ist ein Pflichtfeld");
      return false;
    }
    if (!SLUG_REGEX.test(tenant.slug)) {
      toast.error(
        "Slug darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten"
      );
      return false;
    }
    return true;
  }

  function validateAdminStep(): boolean {
    if (adminMode === "skip") {
      return true;
    }

    if (!admin.email.trim()) {
      toast.error("E-Mail ist ein Pflichtfeld");
      return false;
    }
    if (!admin.firstName.trim()) {
      toast.error("Vorname ist ein Pflichtfeld");
      return false;
    }
    if (!admin.lastName.trim()) {
      toast.error("Nachname ist ein Pflichtfeld");
      return false;
    }

    if (adminMode === "password") {
      if (admin.password.length < 8) {
        toast.error("Passwort muss mindestens 8 Zeichen lang sein");
        return false;
      }
      if (admin.password !== admin.passwordConfirm) {
        toast.error("Passwörter stimmen nicht überein");
        return false;
      }
    }

    return true;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Navigation
  // ──────────────────────────────────────────────────────────────────────────

  function handleNext() {
    if (!validateTenantStep()) return;

    // Pre-fill admin email from contact email if admin email is still empty
    if (tenant.contactEmail.trim() && !admin.email.trim()) {
      setAdmin((prev) => ({ ...prev, email: tenant.contactEmail.trim() }));
    }

    setCurrentStep(1);
  }

  function handleBack() {
    setCurrentStep(0);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Submit
  // ──────────────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!validateAdminStep()) return;

    setIsSaving(true);

    try {
      const body: Record<string, unknown> = {
        name: tenant.name.trim(),
        slug: tenant.slug.trim(),
        contactEmail: tenant.contactEmail.trim() || undefined,
        contactPhone: tenant.contactPhone.trim() || undefined,
        street: tenant.street.trim() || undefined,
        houseNumber: tenant.houseNumber.trim() || undefined,
        postalCode: tenant.postalCode.trim() || undefined,
        city: tenant.city.trim() || undefined,
        primaryColor: tenant.primaryColor,
        secondaryColor: tenant.secondaryColor,
      };

      if (adminMode !== "skip") {
        body.adminUser = {
          email: admin.email.trim(),
          firstName: admin.firstName.trim(),
          lastName: admin.lastName.trim(),
          mode: adminMode,
          password: adminMode === "password" ? admin.password : undefined,
        };
      }

      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          (json as { error?: string }).error ||
            "Fehler beim Erstellen des Mandanten"
        );
      }

      const json = await res.json().catch(() => ({})) as { emailSent?: boolean };

      // Toast based on mode
      if (adminMode === "invitation") {
        if (json.emailSent) {
          toast.success(
            `Mandant erstellt und Einladung an ${admin.email.trim()} gesendet.`
          );
        } else {
          toast.warning(
            "Mandant erstellt, aber Einladungs-E-Mail konnte nicht gesendet werden. Bitte E-Mail-Konfiguration prüfen."
          );
        }
      } else if (adminMode === "password") {
        toast.success("Mandant und Admin-Benutzer erstellt.");
      } else {
        toast.success("Mandant erstellt.");
      }

      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Fehler beim Erstellen des Mandanten"
      );
    } finally {
      setIsSaving(false);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Render: Step 0 - Mandantendaten
  // ──────────────────────────────────────────────────────────────────────────

  function renderTenantStep() {
    return (
      <div className="space-y-4">
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="wizard-tenant-name">
            Firmenname <span className="text-destructive">*</span>
          </Label>
          <Input
            id="wizard-tenant-name"
            value={tenant.name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="z.B. Scharper GmbH"
          />
        </div>

        {/* Slug */}
        <div className="space-y-2">
          <Label htmlFor="wizard-tenant-slug">
            Slug <span className="text-destructive">*</span>
          </Label>
          <Input
            id="wizard-tenant-slug"
            value={tenant.slug}
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="z.B. windpark-barenburg"
          />
          <p className="text-xs text-muted-foreground">
            Nur Kleinbuchstaben, Zahlen und Bindestriche
          </p>
        </div>

        {/* Contact Email */}
        <div className="space-y-2">
          <Label htmlFor="wizard-tenant-email">Kontakt-E-Mail</Label>
          <Input
            id="wizard-tenant-email"
            type="email"
            value={tenant.contactEmail}
            onChange={(e) =>
              setTenant((prev) => ({ ...prev, contactEmail: e.target.value }))
            }
            placeholder="info@example.de"
          />
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <Label htmlFor="wizard-tenant-phone">Telefon</Label>
          <Input
            id="wizard-tenant-phone"
            value={tenant.contactPhone}
            onChange={(e) =>
              setTenant((prev) => ({ ...prev, contactPhone: e.target.value }))
            }
            placeholder="+49 123 456789"
          />
        </div>

        {/* Address */}
        <div className="space-y-2">
          <Label>Adresse</Label>
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-8 space-y-2">
              <Label htmlFor="wizard-tenant-street">Strasse</Label>
              <Input
                id="wizard-tenant-street"
                value={tenant.street}
                onChange={(e) =>
                  setTenant((prev) => ({ ...prev, street: e.target.value }))
                }
                placeholder="Musterstrasse"
              />
            </div>
            <div className="col-span-4 space-y-2">
              <Label htmlFor="wizard-tenant-houseNumber">Hausnummer</Label>
              <Input
                id="wizard-tenant-houseNumber"
                value={tenant.houseNumber}
                onChange={(e) =>
                  setTenant((prev) => ({ ...prev, houseNumber: e.target.value }))
                }
                placeholder="1a"
              />
            </div>
            <div className="col-span-4 space-y-2">
              <Label htmlFor="wizard-tenant-postalCode">PLZ</Label>
              <Input
                id="wizard-tenant-postalCode"
                value={tenant.postalCode}
                onChange={(e) =>
                  setTenant((prev) => ({ ...prev, postalCode: e.target.value }))
                }
                placeholder="12345"
              />
            </div>
            <div className="col-span-8 space-y-2">
              <Label htmlFor="wizard-tenant-city">Ort</Label>
              <Input
                id="wizard-tenant-city"
                value={tenant.city}
                onChange={(e) =>
                  setTenant((prev) => ({ ...prev, city: e.target.value }))
                }
                placeholder="Musterstadt"
              />
            </div>
          </div>
        </div>

        {/* Colors */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="wizard-tenant-primary">Primaerfarbe</Label>
            <div className="flex gap-2">
              <input
                type="color"
                id="wizard-tenant-primary"
                value={tenant.primaryColor}
                onChange={(e) =>
                  setTenant((prev) => ({
                    ...prev,
                    primaryColor: e.target.value,
                  }))
                }
                className="h-10 w-10 rounded border cursor-pointer shrink-0"
              />
              <Input
                value={tenant.primaryColor}
                onChange={(e) =>
                  setTenant((prev) => ({
                    ...prev,
                    primaryColor: e.target.value,
                  }))
                }
                className="font-mono text-xs"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wizard-tenant-secondary">Sekundaerfarbe</Label>
            <div className="flex gap-2">
              <input
                type="color"
                id="wizard-tenant-secondary"
                value={tenant.secondaryColor}
                onChange={(e) =>
                  setTenant((prev) => ({
                    ...prev,
                    secondaryColor: e.target.value,
                  }))
                }
                className="h-10 w-10 rounded border cursor-pointer shrink-0"
              />
              <Input
                value={tenant.secondaryColor}
                onChange={(e) =>
                  setTenant((prev) => ({
                    ...prev,
                    secondaryColor: e.target.value,
                  }))
                }
                className="font-mono text-xs"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Render: Step 1 - Admin-Benutzer
  // ──────────────────────────────────────────────────────────────────────────

  function renderAdminUserFields() {
    return (
      <div className="space-y-4">
        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="wizard-admin-email">
            E-Mail <span className="text-destructive">*</span>
          </Label>
          <Input
            id="wizard-admin-email"
            type="email"
            value={admin.email}
            onChange={(e) =>
              setAdmin((prev) => ({ ...prev, email: e.target.value }))
            }
            placeholder="admin@example.de"
          />
        </div>

        {/* First / Last Name */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="wizard-admin-firstname">
              Vorname <span className="text-destructive">*</span>
            </Label>
            <Input
              id="wizard-admin-firstname"
              value={admin.firstName}
              onChange={(e) =>
                setAdmin((prev) => ({ ...prev, firstName: e.target.value }))
              }
              placeholder="Max"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wizard-admin-lastname">
              Nachname <span className="text-destructive">*</span>
            </Label>
            <Input
              id="wizard-admin-lastname"
              value={admin.lastName}
              onChange={(e) =>
                setAdmin((prev) => ({ ...prev, lastName: e.target.value }))
              }
              placeholder="Mustermann"
            />
          </div>
        </div>
      </div>
    );
  }

  function renderAdminStep() {
    return (
      <Tabs
        value={adminMode}
        onValueChange={(v) => setAdminMode(v as AdminMode)}
      >
        <TabsList className="w-full">
          <TabsTrigger value="invitation" className="flex-1 gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            Einladung
          </TabsTrigger>
          <TabsTrigger value="password" className="flex-1 gap-1.5">
            <KeyRound className="h-3.5 w-3.5" />
            Passwort
          </TabsTrigger>
          <TabsTrigger value="skip" className="flex-1 gap-1.5">
            <SkipForward className="h-3.5 w-3.5" />
            Überspringen
          </TabsTrigger>
        </TabsList>

        {/* Tab: Einladung */}
        <TabsContent value="invitation" className="space-y-4 mt-4">
          {renderAdminUserFields()}
          <p className="text-sm text-muted-foreground rounded-md bg-muted/50 p-3">
            Eine Einladungs-E-Mail mit Aktivierungslink (7 Tage gültig) wird an
            diese Adresse gesendet.
          </p>
        </TabsContent>

        {/* Tab: Passwort */}
        <TabsContent value="password" className="space-y-4 mt-4">
          {renderAdminUserFields()}

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="wizard-admin-password">
              Passwort <span className="text-destructive">*</span>
            </Label>
            <Input
              id="wizard-admin-password"
              type="password"
              value={admin.password}
              onChange={(e) =>
                setAdmin((prev) => ({ ...prev, password: e.target.value }))
              }
              placeholder="Mindestens 8 Zeichen"
            />
            <p className="text-xs text-muted-foreground">
              Mindestens 8 Zeichen
            </p>
          </div>

          {/* Password Confirm */}
          <div className="space-y-2">
            <Label htmlFor="wizard-admin-password-confirm">
              Passwort bestätigen <span className="text-destructive">*</span>
            </Label>
            <Input
              id="wizard-admin-password-confirm"
              type="password"
              value={admin.passwordConfirm}
              onChange={(e) =>
                setAdmin((prev) => ({
                  ...prev,
                  passwordConfirm: e.target.value,
                }))
              }
              placeholder="Passwort wiederholen"
            />
          </div>
        </TabsContent>

        {/* Tab: Überspringen */}
        <TabsContent value="skip" className="mt-4">
          <p className="text-sm text-muted-foreground rounded-md bg-muted/50 p-3">
            Der Mandant wird ohne Admin-Benutzer erstellt. Sie können Benutzer
            später in der Mandantenverwaltung unter &quot;Benutzer&quot;
            anlegen.
          </p>
        </TabsContent>
      </Tabs>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Render: Main
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Neuer Mandant</DialogTitle>
          <DialogDescription>
            Erstellen Sie einen neuen Mandanten (Verwaltungsfirma) mit optionalem
            Administrator-Benutzer.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <Stepper steps={STEPS} currentStep={currentStep} />

        {/* Step Content */}
        <StepContent className="mt-4">
          {currentStep === 0 ? renderTenantStep() : renderAdminStep()}
        </StepContent>

        {/* Actions */}
        <StepActions className="mt-4">
          {currentStep === 0 ? (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Abbrechen
              </Button>
              <Button onClick={handleNext}>
                Weiter
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={isSaving}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Zurück
              </Button>
              <Button onClick={handleSubmit} disabled={isSaving}>
                {isSaving && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isSaving ? "Erstellen..." : "Mandant erstellen"}
              </Button>
            </>
          )}
        </StepActions>
      </DialogContent>
    </Dialog>
  );
}
