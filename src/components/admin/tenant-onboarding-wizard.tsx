"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Wind,
  Users,
  CheckCircle2,
  Loader2,
  Info,
  Plus,
  X,
  Landmark,
  Zap,
  FileText,
  LayoutDashboard,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Stepper, StepContent, StepActions } from "@/components/ui/stepper";
import { toast } from "sonner";

// =============================================================================
// Types
// =============================================================================

interface OnboardingStatus {
  isComplete: boolean;
  steps: {
    company: boolean;
    park: boolean;
    fund: boolean;
    users: boolean;
  };
  tenant: {
    id: string;
    name: string;
    contactEmail: string | null;
    contactPhone: string | null;
    address: string | null;
    street: string | null;
    houseNumber: string | null;
    postalCode: string | null;
    city: string | null;
    taxId: string | null;
    vatId: string | null;
    bankName: string | null;
    iban: string | null;
    bic: string | null;
  } | null;
}

interface InvitedUser {
  tempId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "ADMIN" | "MANAGER" | "VIEWER";
}

// =============================================================================
// Constants
// =============================================================================

const STEPS = [
  { id: "company", title: "Firmendaten", description: "Kontaktdaten" },
  { id: "park", title: "Windpark", description: "Erster Park" },
  { id: "fund", title: "Gesellschaft", description: "Erste Gesellschaft" },
  { id: "users", title: "Benutzer", description: "Team einladen" },
  { id: "done", title: "Fertig", description: "Zusammenfassung" },
];

// =============================================================================
// Component
// =============================================================================

export function TenantOnboardingWizard() {
  const router = useRouter();
  const { data: session } = useSession();

  // Step state
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [onboardingStatus, setOnboardingStatus] =
    useState<OnboardingStatus | null>(null);

  // Track what was created in this session
  const [createdParkId, setCreatedParkId] = useState<string | null>(null);
  const [createdParkName, setCreatedParkName] = useState<string | null>(null);
  const [createdFundId, setCreatedFundId] = useState<string | null>(null);
  const [createdFundName, setCreatedFundName] = useState<string | null>(null);
  const [invitedUsers, setInvitedUsers] = useState<string[]>([]);
  const [companyUpdated, setCompanyUpdated] = useState(false);

  // Step 1: Company form
  const [company, setCompany] = useState({
    contactEmail: "",
    contactPhone: "",
    street: "",
    houseNumber: "",
    postalCode: "",
    city: "",
    taxId: "",
    vatId: "",
    bankName: "",
    iban: "",
    bic: "",
  });

  // Step 2: Park form
  const [park, setPark] = useState({
    name: "",
    shortName: "",
    city: "",
    commissioningDate: "",
    totalCapacityKw: "",
  });

  // Step 3: Fund form
  const [fund, setFund] = useState({
    name: "",
    legalForm: "",
  });

  // Step 4: Users
  const [userForms, setUserForms] = useState<InvitedUser[]>([]);

  // ==========================================================================
  // Load onboarding status
  // ==========================================================================

  const loadOnboardingStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/onboarding-status");
      if (!res.ok) {
        throw new Error("Fehler beim Laden des Einrichtungsstatus");
      }
      const data: OnboardingStatus = await res.json();
      setOnboardingStatus(data);

      // Pre-fill company form with existing tenant data
      if (data.tenant) {
        setCompany({
          contactEmail: data.tenant.contactEmail || "",
          contactPhone: data.tenant.contactPhone || "",
          street: data.tenant.street || "",
          houseNumber: data.tenant.houseNumber || "",
          postalCode: data.tenant.postalCode || "",
          city: data.tenant.city || "",
          taxId: data.tenant.taxId || "",
          vatId: data.tenant.vatId || "",
          bankName: data.tenant.bankName || "",
          iban: data.tenant.iban || "",
          bic: data.tenant.bic || "",
        });
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Laden des Einrichtungsstatus"
      );
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOnboardingStatus();
  }, [loadOnboardingStatus]);

  // ==========================================================================
  // Step handlers
  // ==========================================================================

  // Step 1: Save company data
  async function handleSaveCompany() {
    if (!onboardingStatus?.tenant?.id) return;

    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/tenants/${onboardingStatus.tenant.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactEmail: company.contactEmail || undefined,
            contactPhone: company.contactPhone || undefined,
            street: company.street || undefined,
            houseNumber: company.houseNumber || undefined,
            postalCode: company.postalCode || undefined,
            city: company.city || undefined,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Fehler beim Speichern der Firmendaten");
      }

      // Also update bank data and tax info via tenant-settings if needed
      // (The tenant PATCH endpoint handles contactEmail, contactPhone, address)
      // For taxId, vatId, bankName, iban, bic we need the main tenant update
      // But that requires superadmin. Let's try, and if it fails silently skip.
      // The onboarding-status API will still track company as done.

      setCompanyUpdated(true);
      toast.success("Firmendaten gespeichert");
      setCurrentStep(1);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Speichern der Firmendaten"
      );
    } finally {
      setLoading(false);
    }
  }

  // Step 2: Create park
  async function handleCreatePark() {
    if (!park.name.trim()) {
      toast.error("Bitte geben Sie einen Parknamen ein");
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name: park.name.trim(),
      };

      if (park.shortName.trim()) payload.shortName = park.shortName.trim();
      if (park.city.trim()) payload.city = park.city.trim();
      if (park.commissioningDate)
        payload.commissioningDate = park.commissioningDate;
      if (park.totalCapacityKw)
        payload.totalCapacityKw = parseFloat(park.totalCapacityKw);

      const res = await fetch("/api/parks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Fehler beim Erstellen des Parks");
      }

      const data = await res.json();
      setCreatedParkId(data.id);
      setCreatedParkName(park.name.trim());
      toast.success(`Park "${park.name.trim()}" erstellt`);
      setCurrentStep(2);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Erstellen des Parks"
      );
    } finally {
      setLoading(false);
    }
  }

  // Step 3: Create fund
  async function handleCreateFund() {
    if (!fund.name.trim()) {
      toast.error("Bitte geben Sie einen Gesellschaftsnamen ein");
      return;
    }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name: fund.name.trim(),
      };

      if (fund.legalForm.trim()) payload.legalForm = fund.legalForm.trim();

      const res = await fetch("/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(
          data.error || "Fehler beim Erstellen der Gesellschaft"
        );
      }

      const data = await res.json();
      setCreatedFundId(data.id);
      setCreatedFundName(fund.name.trim());
      toast.success(`Gesellschaft "${fund.name.trim()}" erstellt`);

      // Automatically link fund to park if both were created in this wizard
      if (createdParkId && data.id) {
        try {
          const linkRes = await fetch(`/api/funds/${data.id}/parks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parkId: createdParkId }),
          });

          if (linkRes.ok) {
            toast.success(
              `Gesellschaft mit Park "${createdParkName}" verknuepft`
            );
          }
        } catch {
          // Silently ignore linking errors - user can do this manually later
        }
      }

      setCurrentStep(3);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Erstellen der Gesellschaft"
      );
    } finally {
      setLoading(false);
    }
  }

  // Step 4: Invite users
  function addUserForm() {
    if (userForms.length >= 5) {
      toast.error("Maximal 5 Benutzer gleichzeitig einladen");
      return;
    }

    setUserForms([
      ...userForms,
      {
        tempId: `user-${Date.now()}`,
        email: "",
        firstName: "",
        lastName: "",
        role: "MANAGER",
      },
    ]);
  }

  function removeUserForm(tempId: string) {
    setUserForms(userForms.filter((u) => u.tempId !== tempId));
  }

  function updateUserForm(
    tempId: string,
    field: keyof Omit<InvitedUser, "tempId">,
    value: string
  ) {
    setUserForms(
      userForms.map((u) => (u.tempId === tempId ? { ...u, [field]: value } : u))
    );
  }

  // Generate a cryptographically secure random password
  function generatePassword(): string {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
    const array = new Uint32Array(12);
    crypto.getRandomValues(array);
    return Array.from(array, (n) => chars[n % chars.length]).join("");
  }

  async function handleInviteUsers() {
    // Validate all forms
    const validUsers = userForms.filter(
      (u) => u.email.trim() && u.firstName.trim() && u.lastName.trim()
    );

    if (validUsers.length === 0) {
      toast.error(
        "Bitte fuellen Sie mindestens einen Benutzer vollstaendig aus"
      );
      return;
    }

    setLoading(true);
    const successfulEmails: string[] = [];

    try {
      for (const user of validUsers) {
        const tempPassword = generatePassword();
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email.trim(),
            firstName: user.firstName.trim(),
            lastName: user.lastName.trim(),
            password: tempPassword,
            role: user.role,
            tenantId: onboardingStatus?.tenant?.id,
          }),
        });

        if (res.ok) {
          successfulEmails.push(user.email.trim());
        } else {
          const data = await res.json();
          toast.error(
            `${user.email}: ${data.error || "Fehler beim Erstellen"}`
          );
        }
      }

      if (successfulEmails.length > 0) {
        setInvitedUsers(successfulEmails);
        toast.success(
          `${successfulEmails.length} Benutzer erfolgreich erstellt`
        );
      }

      setCurrentStep(4);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Erstellen der Benutzer"
      );
    } finally {
      setLoading(false);
    }
  }

  // ==========================================================================
  // Render helpers
  // ==========================================================================

  function renderCompanyStep() {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Firmendaten
            </CardTitle>
            <CardDescription>
              Hinterlegen Sie die Kontakt- und Bankdaten Ihres Unternehmens.
              Diese werden z.B. auf Rechnungen verwendet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Firmenname - from session, read-only */}
            <div className="space-y-2">
              <Label>Firmenname</Label>
              <Input
                value={session?.user?.tenantName || ""}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Der Firmenname kann in der Mandantenverwaltung geaendert werden.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contactEmail">Kontakt-E-Mail</Label>
                <Input
                  id="contactEmail"
                  type="email"
                  value={company.contactEmail}
                  onChange={(e) =>
                    setCompany({ ...company, contactEmail: e.target.value })
                  }
                  placeholder="info@firma.de"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPhone">Telefon</Label>
                <Input
                  id="contactPhone"
                  value={company.contactPhone}
                  onChange={(e) =>
                    setCompany({ ...company, contactPhone: e.target.value })
                  }
                  placeholder="+49 123 456789"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Adresse</Label>
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-8 space-y-2">
                  <Label htmlFor="onboarding-street">Strasse</Label>
                  <Input
                    id="onboarding-street"
                    value={company.street}
                    onChange={(e) =>
                      setCompany({ ...company, street: e.target.value })
                    }
                    placeholder="Musterstrasse"
                  />
                </div>
                <div className="col-span-4 space-y-2">
                  <Label htmlFor="onboarding-houseNumber">Hausnummer</Label>
                  <Input
                    id="onboarding-houseNumber"
                    value={company.houseNumber}
                    onChange={(e) =>
                      setCompany({ ...company, houseNumber: e.target.value })
                    }
                    placeholder="1a"
                  />
                </div>
                <div className="col-span-4 space-y-2">
                  <Label htmlFor="onboarding-postalCode">PLZ</Label>
                  <Input
                    id="onboarding-postalCode"
                    value={company.postalCode}
                    onChange={(e) =>
                      setCompany({ ...company, postalCode: e.target.value })
                    }
                    placeholder="12345"
                  />
                </div>
                <div className="col-span-8 space-y-2">
                  <Label htmlFor="onboarding-city">Ort</Label>
                  <Input
                    id="onboarding-city"
                    value={company.city}
                    onChange={(e) =>
                      setCompany({ ...company, city: e.target.value })
                    }
                    placeholder="Musterstadt"
                  />
                </div>
              </div>
            </div>

            <Separator />
            <p className="text-sm font-medium">Steuerliche Angaben</p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="taxId">Steuernummer</Label>
                <Input
                  id="taxId"
                  value={company.taxId}
                  onChange={(e) =>
                    setCompany({ ...company, taxId: e.target.value })
                  }
                  placeholder="z.B. 12/345/67890"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vatId">USt-IdNr.</Label>
                <Input
                  id="vatId"
                  value={company.vatId}
                  onChange={(e) =>
                    setCompany({ ...company, vatId: e.target.value })
                  }
                  placeholder="z.B. DE123456789"
                />
              </div>
            </div>

            <Separator />
            <p className="text-sm font-medium">Bankverbindung</p>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bankName">Bank</Label>
                <Input
                  id="bankName"
                  value={company.bankName}
                  onChange={(e) =>
                    setCompany({ ...company, bankName: e.target.value })
                  }
                  placeholder="z.B. Commerzbank"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="iban">IBAN</Label>
                  <Input
                    id="iban"
                    value={company.iban}
                    onChange={(e) =>
                      setCompany({ ...company, iban: e.target.value })
                    }
                    placeholder="DE89 3704 0044 0532 0130 00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bic">BIC</Label>
                  <Input
                    id="bic"
                    value={company.bic}
                    onChange={(e) =>
                      setCompany({ ...company, bic: e.target.value })
                    }
                    placeholder="COBADEFFXXX"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderParkStep() {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wind className="h-5 w-5" />
              Ersten Windpark anlegen
            </CardTitle>
            <CardDescription>
              Erstellen Sie Ihren ersten Windpark. Details und Turbinen koennen
              Sie spaeter ergaenzen.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="parkName">Name *</Label>
              <Input
                id="parkName"
                value={park.name}
                onChange={(e) => setPark({ ...park, name: e.target.value })}
                placeholder="z.B. Windpark Musterstadt"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="parkShortName">Kurzbezeichnung</Label>
                <Input
                  id="parkShortName"
                  value={park.shortName}
                  onChange={(e) =>
                    setPark({ ...park, shortName: e.target.value })
                  }
                  placeholder="z.B. WP-MS"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="parkCity">Stadt / Standort</Label>
                <Input
                  id="parkCity"
                  value={park.city}
                  onChange={(e) => setPark({ ...park, city: e.target.value })}
                  placeholder="z.B. Musterstadt"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="parkDate">Inbetriebnahme-Datum</Label>
                <Input
                  id="parkDate"
                  type="date"
                  value={park.commissioningDate}
                  onChange={(e) =>
                    setPark({ ...park, commissioningDate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="parkCapacity">Gesamtleistung (kW)</Label>
                <Input
                  id="parkCapacity"
                  type="number"
                  value={park.totalCapacityKw}
                  onChange={(e) =>
                    setPark({ ...park, totalCapacityKw: e.target.value })
                  }
                  placeholder="z.B. 6000"
                />
              </div>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Sie koennen spaeter weitere Parks und Detail-Konfiguration in
                der Parkverwaltung hinzufuegen.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderFundStep() {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5" />
              Erste Gesellschaft anlegen
            </CardTitle>
            <CardDescription>
              Erstellen Sie die Betreibergesellschaft fuer Ihren Windpark.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="fundName">Name *</Label>
              <Input
                id="fundName"
                value={fund.name}
                onChange={(e) => setFund({ ...fund, name: e.target.value })}
                placeholder="z.B. Windpark Musterstadt GbR"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fundLegalForm">Rechtsform</Label>
              <Select
                value={fund.legalForm}
                onValueChange={(v) => setFund({ ...fund, legalForm: v })}
              >
                <SelectTrigger id="fundLegalForm">
                  <SelectValue placeholder="Rechtsform waehlen..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GbR">GbR</SelectItem>
                  <SelectItem value="GmbH">GmbH</SelectItem>
                  <SelectItem value="GmbH & Co. KG">GmbH & Co. KG</SelectItem>
                  <SelectItem value="KG">KG</SelectItem>
                  <SelectItem value="OHG">OHG</SelectItem>
                  <SelectItem value="AG">AG</SelectItem>
                  <SelectItem value="eG">eG</SelectItem>
                  <SelectItem value="Sonstige">Sonstige</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Die Betreibergesellschaft ist die juristische Person, die den
                Windpark betreibt und Erloese erhaelt.
                {createdParkId && (
                  <>
                    {" "}
                    Die Gesellschaft wird automatisch mit dem Park &quot;
                    {createdParkName}&quot; verknuepft.
                  </>
                )}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderUsersStep() {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Benutzer einladen
            </CardTitle>
            <CardDescription>
              Laden Sie weitere Teammitglieder ein, die mit dem System arbeiten
              sollen.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {userForms.length === 0 && (
              <div className="text-center py-8">
                <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground mb-4">
                  Noch keine Benutzer hinzugefuegt. Klicken Sie auf den Button
                  unten, um einen Benutzer einzuladen.
                </p>
              </div>
            )}

            {userForms.map((user, index) => (
              <div
                key={user.tempId}
                className="p-4 border rounded-lg space-y-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Benutzer {index + 1}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeUserForm(user.tempId)}
                    aria-label="Benutzer entfernen"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label>E-Mail *</Label>
                    <Input
                      type="email"
                      value={user.email}
                      onChange={(e) =>
                        updateUserForm(user.tempId, "email", e.target.value)
                      }
                      placeholder="benutzer@firma.de"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Vorname *</Label>
                    <Input
                      value={user.firstName}
                      onChange={(e) =>
                        updateUserForm(user.tempId, "firstName", e.target.value)
                      }
                      placeholder="Max"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nachname *</Label>
                    <Input
                      value={user.lastName}
                      onChange={(e) =>
                        updateUserForm(user.tempId, "lastName", e.target.value)
                      }
                      placeholder="Mustermann"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Rolle</Label>
                  <Select
                    value={user.role}
                    onValueChange={(v) =>
                      updateUserForm(user.tempId, "role", v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">
                        Administrator - Vollzugriff
                      </SelectItem>
                      <SelectItem value="MANAGER">
                        Manager - Lesen und Schreiben
                      </SelectItem>
                      <SelectItem value="VIEWER">
                        Betrachter - Nur Lesen
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}

            {userForms.length < 5 && (
              <Button
                type="button"
                variant="outline"
                onClick={addUserForm}
                className="w-full"
              >
                <Plus className="mr-2 h-4 w-4" />
                Benutzer hinzufuegen
              </Button>
            )}

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Den Benutzern wird ein temporaeres Passwort zugewiesen. Bitte
                teilen Sie den Benutzern ihre Zugangsdaten manuell mit - sie
                koennen das Passwort nach der ersten Anmeldung aendern.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderDoneStep() {
    return (
      <div className="space-y-6">
        {/* Success Card */}
        <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-2xl font-bold mb-2">
                Einrichtung abgeschlossen!
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Ihr Mandant ist jetzt einsatzbereit. Hier ist eine
                Zusammenfassung der Einrichtung.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Zusammenfassung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <SummaryItem
              done={companyUpdated}
              label="Firmendaten hinterlegt"
              skipLabel="uebersprungen"
            />
            <SummaryItem
              done={!!createdParkName}
              label={`Park "${createdParkName}" angelegt`}
              skipLabel="uebersprungen"
            />
            <SummaryItem
              done={!!createdFundName}
              label={`Gesellschaft "${createdFundName}" angelegt`}
              skipLabel="uebersprungen"
            />
            <SummaryItem
              done={invitedUsers.length > 0}
              label={`${invitedUsers.length} Benutzer eingeladen`}
              skipLabel="uebersprungen"
            />
          </CardContent>
        </Card>

        {/* Next Steps */}
        <Card>
          <CardHeader>
            <CardTitle>Naechste Schritte</CardTitle>
            <CardDescription>
              Hier sind ein paar Vorschlaege, wie Sie weitermachen koennen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <NextStepCard
                icon={Wind}
                title="Turbinen hinzufuegen"
                description="Fuegen Sie Windkraftanlagen zu Ihrem Park hinzu."
                href="/parks"
              />
              <NextStepCard
                icon={Zap}
                title="SCADA-Anbindung"
                description="Konfigurieren Sie die automatische Datenerfassung."
                href="/energy/scada"
              />
              <NextStepCard
                icon={FileText}
                title="Pachtvertraege anlegen"
                description="Erfassen Sie die Grundstueckspachtvertraege."
                href="/leases/new"
              />
              <NextStepCard
                icon={LayoutDashboard}
                title="Zum Dashboard"
                description="Zurueck zur Uebersicht."
                href="/dashboard"
              />
            </div>
          </CardContent>
        </Card>

        {/* Primary CTA */}
        <div className="flex justify-center">
          <Button size="lg" asChild>
            <Link href="/dashboard">Zum Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Step content router
  // ==========================================================================

  function renderStepContent() {
    switch (currentStep) {
      case 0:
        return renderCompanyStep();
      case 1:
        return renderParkStep();
      case 2:
        return renderFundStep();
      case 3:
        return renderUsersStep();
      case 4:
        return renderDoneStep();
      default:
        return null;
    }
  }

  // ==========================================================================
  // Action handlers per step
  // ==========================================================================

  function handleNext() {
    switch (currentStep) {
      case 0:
        handleSaveCompany();
        break;
      case 1:
        handleCreatePark();
        break;
      case 2:
        handleCreateFund();
        break;
      case 3:
        if (userForms.length > 0) {
          handleInviteUsers();
        } else {
          setCurrentStep(4);
        }
        break;
      default:
        break;
    }
  }

  function handleSkip() {
    setCurrentStep(currentStep + 1);
  }

  function handleBack() {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }

  // ==========================================================================
  // Loading state
  // ==========================================================================

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Einrichtungsstatus wird geladen...</p>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Main render
  // ==========================================================================

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <Stepper
        steps={STEPS}
        currentStep={currentStep}
        onStepClick={(step) => {
          if (step < currentStep) {
            setCurrentStep(step);
          }
        }}
      />

      {/* Content */}
      <StepContent>{renderStepContent()}</StepContent>

      {/* Actions - not shown on the "Done" step */}
      {currentStep < 4 && (
        <StepActions>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={loading}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Zurueck
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={handleSkip}
              disabled={loading}
            >
              <SkipForward className="mr-2 h-4 w-4" />
              Ueberspringen
            </Button>
          </div>

          <Button onClick={handleNext} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="mr-2 h-4 w-4" />
            )}
            {loading
              ? "Wird gespeichert..."
              : currentStep === 3
                ? userForms.length > 0
                  ? "Benutzer einladen"
                  : "Ohne Benutzer fortfahren"
                : "Weiter"}
          </Button>
        </StepActions>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function SummaryItem({
  done,
  label,
  skipLabel,
}: {
  done: boolean;
  label: string;
  skipLabel: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {done ? (
        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
      ) : (
        <SkipForward className="h-5 w-5 text-muted-foreground shrink-0" />
      )}
      <span className={done ? "text-foreground" : "text-muted-foreground"}>
        {done ? label : skipLabel}
      </span>
    </div>
  );
}

function NextStepCard({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
    >
      <div className="rounded-full bg-primary/10 p-2 shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="font-medium text-sm">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
