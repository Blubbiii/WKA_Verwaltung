"use client";

import { useState, useEffect, useCallback } from "react";
import { User, Building2, Search, Plus, Loader2, UserPlus } from "lucide-react";
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
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

interface Person {
  id: string;
  personType: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  _count: {
    shareholders: number;
    leases: number;
  };
}

export interface RecipientSelection {
  recipientType: "PERSON" | "COMPANY";
  recipientName: string;
  recipientAddress: string;
}

interface RecipientSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (recipient: RecipientSelection) => void;
}

type Step = "search" | "create";

function getPersonDisplayName(person: Person): string {
  if (person.personType === "legal" && person.companyName) {
    return person.companyName;
  }
  return [person.firstName, person.lastName].filter(Boolean).join(" ");
}

function getPersonAddress(person: Person): string {
  const parts: string[] = [];
  if (person.street) parts.push(person.street);
  if (person.postalCode || person.city) {
    parts.push([person.postalCode, person.city].filter(Boolean).join(" "));
  }
  return parts.join("\n");
}

function getPersonRole(person: Person): string | null {
  const roles: string[] = [];
  if (person._count.shareholders > 0) roles.push("Gesellschafter");
  if (person._count.leases > 0) roles.push("Verpächter");
  if (roles.length === 0) return null;
  return roles.join(", ");
}

export function RecipientSearchDialog({
  open,
  onOpenChange,
  onSelect,
}: RecipientSearchDialogProps) {
  const [step, setStep] = useState<Step>("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [persons, setPersons] = useState<Person[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Create form
  const [newPersonType, setNewPersonType] = useState<"natural" | "legal">("natural");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newStreet, setNewStreet] = useState("");
  const [newPostalCode, setNewPostalCode] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newEmail, setNewEmail] = useState("");

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep("search");
      setSearchQuery("");
      resetCreateForm();
    }
  }, [open]);

  function resetCreateForm() {
    setNewPersonType("natural");
    setNewFirstName("");
    setNewLastName("");
    setNewCompanyName("");
    setNewStreet("");
    setNewPostalCode("");
    setNewCity("");
    setNewEmail("");
  }

  // Debounced search
  const fetchPersons = useCallback(async (query: string) => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set("search", query);
      params.set("limit", "20");
      params.set("status", "ACTIVE");

      const response = await fetch(`/api/persons?${params}`);
      if (response.ok) {
        const data = await response.json();
        setPersons(data.data || []);
      }
    } catch {
      // Person search failed silently
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!open || step !== "search") return;
    const timer = setTimeout(() => {
      fetchPersons(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, open, step, fetchPersons]);

  function handleSelectPerson(person: Person) {
    const isCompany = person.personType === "legal";
    onSelect({
      recipientType: isCompany ? "COMPANY" : "PERSON",
      recipientName: getPersonDisplayName(person),
      recipientAddress: getPersonAddress(person),
    });
    onOpenChange(false);
  }

  async function handleCreatePerson() {
    // Validierung
    if (newPersonType === "natural" && (!newFirstName.trim() || !newLastName.trim())) {
      toast.error("Vor- und Nachname sind erforderlich");
      return;
    }
    if (newPersonType === "legal" && !newCompanyName.trim()) {
      toast.error("Firmenname ist erforderlich");
      return;
    }

    try {
      setIsCreating(true);
      const response = await fetch("/api/persons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personType: newPersonType,
          firstName: newPersonType === "natural" ? newFirstName.trim() : undefined,
          lastName: newPersonType === "natural" ? newLastName.trim() : undefined,
          companyName: newPersonType === "legal" ? newCompanyName.trim() : undefined,
          street: newStreet.trim() || undefined,
          postalCode: newPostalCode.trim() || undefined,
          city: newCity.trim() || undefined,
          email: newEmail.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Anlegen");
      }

      const created = await response.json();
      toast.success("Kunde erfolgreich angelegt");

      // Select the newly created person
      const isCompany = newPersonType === "legal";
      const name = isCompany
        ? newCompanyName.trim()
        : `${newFirstName.trim()} ${newLastName.trim()}`;
      const addressParts: string[] = [];
      if (newStreet.trim()) addressParts.push(newStreet.trim());
      if (newPostalCode.trim() || newCity.trim()) {
        addressParts.push([newPostalCode.trim(), newCity.trim()].filter(Boolean).join(" "));
      }

      onSelect({
        recipientType: isCompany ? "COMPANY" : "PERSON",
        recipientName: name,
        recipientAddress: addressParts.join("\n"),
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Anlegen");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "search" ? "Empfaenger auswaehlen" : "Neuen Kunden anlegen"}
          </DialogTitle>
          <DialogDescription>
            {step === "search"
              ? "Suchen Sie nach einem bestehenden Kontakt oder legen Sie einen neuen an."
              : "Erfassen Sie die Daten des neuen Kunden."}
          </DialogDescription>
        </DialogHeader>

        {step === "search" ? (
          <div className="space-y-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Name, Firma oder E-Mail suchen..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                autoFocus
              />
            </div>

            {/* Results */}
            <div className="max-h-[320px] overflow-y-auto space-y-1">
              {isSearching ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : persons.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">
                  {searchQuery
                    ? "Keine Kontakte gefunden"
                    : "Geben Sie einen Suchbegriff ein"}
                </div>
              ) : (
                persons.map((person) => {
                  const role = getPersonRole(person);
                  return (
                    <button
                      key={person.id}
                      type="button"
                      className="w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-muted transition-colors"
                      onClick={() => handleSelectPerson(person)}
                    >
                      <div className="flex-shrink-0">
                        {person.personType === "legal" ? (
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <User className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">
                          {getPersonDisplayName(person)}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {[
                            person.email,
                            person.city,
                            role,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <Separator />

            {/* Create New */}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setStep("create")}
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Neuen Kunden anlegen
            </Button>
          </div>
        ) : (
          /* Create Form */
          <div className="space-y-4">
            {/* Person Type */}
            <div className="space-y-2">
              <Label>Typ</Label>
              <RadioGroup
                value={newPersonType}
                onValueChange={(v) => setNewPersonType(v as "natural" | "legal")}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="natural" id="type-natural" />
                  <Label htmlFor="type-natural" className="flex items-center gap-1.5 cursor-pointer">
                    <User className="h-4 w-4" />
                    Person
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="legal" id="type-legal" />
                  <Label htmlFor="type-legal" className="flex items-center gap-1.5 cursor-pointer">
                    <Building2 className="h-4 w-4" />
                    Unternehmen
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Name Fields */}
            {newPersonType === "natural" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="new-firstName">Vorname *</Label>
                  <Input
                    id="new-firstName"
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    placeholder="Vorname"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-lastName">Nachname *</Label>
                  <Input
                    id="new-lastName"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    placeholder="Nachname"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="new-companyName">Firmenname *</Label>
                <Input
                  id="new-companyName"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder="Firmenname"
                  autoFocus
                />
              </div>
            )}

            {/* Address */}
            <div className="space-y-2">
              <Label htmlFor="new-street">Strasse</Label>
              <Input
                id="new-street"
                value={newStreet}
                onChange={(e) => setNewStreet(e.target.value)}
                placeholder="Strasse und Hausnummer"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="new-postalCode">PLZ</Label>
                <Input
                  id="new-postalCode"
                  value={newPostalCode}
                  onChange={(e) => setNewPostalCode(e.target.value)}
                  placeholder="PLZ"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="new-city">Ort</Label>
                <Input
                  id="new-city"
                  value={newCity}
                  onChange={(e) => setNewCity(e.target.value)}
                  placeholder="Ort"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="new-email">E-Mail</Label>
              <Input
                id="new-email"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="E-Mail-Adresse (optional)"
              />
            </div>

            <Separator />

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStep("search");
                  resetCreateForm();
                }}
              >
                Zurueck
              </Button>
              <Button
                type="button"
                onClick={handleCreatePerson}
                disabled={isCreating}
              >
                {isCreating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Anlegen und auswaehlen
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
