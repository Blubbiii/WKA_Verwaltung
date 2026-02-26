"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { formatCurrency } from "@/lib/format";
import {
  Loader2,
  Search,
  Plus,
  User,
  Building2,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Wallet,
  Percent,
  FileText,
  Vote,
  Upload,
  Download,
  Eye,
} from "lucide-react";
import Link from "next/link";
import { DocumentPreviewDialog } from "@/components/documents";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";

// Types
interface Person {
  id: string;
  personType: "natural" | "legal";
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
}

interface Shareholder {
  id: string;
  shareholderNumber: string | null;
  capitalContribution: number | null;
  ownershipPercentage: number | null;
  votingRightsPercentage: number | null;
  distributionPercentage: number | null;
  entryDate: string | null;
  exitDate: string | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  notes: string | null;
  person: Person;
}

interface ShareholderDocument {
  id: string;
  title: string;
  fileName: string;
  fileUrl: string;
  mimeType: string | null;
  category: string;
  createdAt: string;
}

interface ShareholderDetail extends Shareholder {
  documents: ShareholderDocument[];
  _count?: {
    documents: number;
    voteResponses: number;
  };
}

interface ShareholderDialogsProps {
  fundId: string;
  fundName: string;
  totalCapital?: number | null;
  existingShareholders: Shareholder[];
  onSuccess: () => void;
  // Add Dialog
  isAddOpen: boolean;
  setIsAddOpen: (open: boolean) => void;
  // Edit Dialog
  isEditOpen: boolean;
  setIsEditOpen: (open: boolean) => void;
  editingShareholder: Shareholder | null;
  // Detail Dialog
  isDetailOpen: boolean;
  setIsDetailOpen: (open: boolean) => void;
  viewingShareholder: Shareholder | null;
}

const statusColors = {
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  INACTIVE: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  ARCHIVED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

const statusLabels = {
  ACTIVE: "Aktiv",
  INACTIVE: "Inaktiv",
  ARCHIVED: "Archiviert",
};

function getPersonName(person: Person): string {
  if (person.personType === "legal") {
    return person.companyName || "-";
  }
  return [person.firstName, person.lastName].filter(Boolean).join(" ") || "-";
}

export function ShareholderDialogs({
  fundId,
  fundName,
  totalCapital,
  existingShareholders,
  onSuccess,
  isAddOpen,
  setIsAddOpen,
  isEditOpen,
  setIsEditOpen,
  editingShareholder,
  isDetailOpen,
  setIsDetailOpen,
  viewingShareholder,
}: ShareholderDialogsProps) {
  return (
    <>
      <AddShareholderDialog
        fundId={fundId}
        fundName={fundName}
        totalCapital={totalCapital}
        existingShareholders={existingShareholders}
        isOpen={isAddOpen}
        setIsOpen={setIsAddOpen}
        onSuccess={onSuccess}
      />
      <EditShareholderDialog
        fundId={fundId}
        totalCapital={totalCapital}
        existingShareholders={existingShareholders}
        shareholder={editingShareholder}
        isOpen={isEditOpen}
        setIsOpen={setIsEditOpen}
        onSuccess={onSuccess}
      />
      <ShareholderDetailDialog
        shareholder={viewingShareholder}
        isOpen={isDetailOpen}
        setIsOpen={setIsDetailOpen}
        onEdit={() => {
          setIsDetailOpen(false);
          setIsEditOpen(true);
        }}
      />
    </>
  );
}

// =====================
// Add Shareholder Dialog
// =====================

interface AddShareholderDialogProps {
  fundId: string;
  fundName: string;
  totalCapital?: number | null;
  existingShareholders: Shareholder[];
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSuccess: () => void;
}

function AddShareholderDialog({
  fundId,
  fundName,
  totalCapital,
  existingShareholders,
  isOpen,
  setIsOpen,
  onSuccess,
}: AddShareholderDialogProps) {
  const [step, setStep] = useState<"select-person" | "enter-details">("select-person");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Person selection
  const [persons, setPersons] = useState<Person[]>([]);
  const [personSearch, setPersonSearch] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);

  // New person creation
  const [isCreatingPerson, setIsCreatingPerson] = useState(false);
  const [newPersonType, setNewPersonType] = useState<"natural" | "legal">("natural");
  const [newPersonData, setNewPersonData] = useState({
    firstName: "",
    lastName: "",
    companyName: "",
    email: "",
    phone: "",
  });

  // Shareholder data
  const [shareholderNumber, setShareholderNumber] = useState("");
  const [entryDate, setEntryDate] = useState<Date | undefined>(new Date());
  const [capitalContribution, setCapitalContribution] = useState("");
  const [notes, setNotes] = useState("");

  // Use fund's Stammkapital as denominator; fall back to sum of contributions
  const totalExistingCapital = existingShareholders
    .filter((sh) => sh.status === "ACTIVE")
    .reduce((sum, sh) => sum + (sh.capitalContribution || 0), 0);
  const stammkapital = totalCapital && totalCapital > 0 ? totalCapital : null;

  // Calculate ownership percentage
  const calculatedPercentage = capitalContribution
    ? stammkapital
      ? ((parseFloat(capitalContribution) / stammkapital) * 100).toFixed(2)
      : ((parseFloat(capitalContribution) / (totalExistingCapital + parseFloat(capitalContribution))) * 100).toFixed(2)
    : "0.00";

  // Reset when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setStep("select-person");
      setSelectedPerson(null);
      setPersonSearch("");
      setShareholderNumber("");
      setEntryDate(new Date());
      setCapitalContribution("");
      setNotes("");
      setIsCreatingPerson(false);
      setNewPersonData({
        firstName: "",
        lastName: "",
        companyName: "",
        email: "",
        phone: "",
      });
    }
  }, [isOpen]);

  // Search persons with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isOpen && step === "select-person") {
        fetchPersons();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [personSearch, isOpen, step]);

  async function fetchPersons() {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      if (personSearch) params.set("search", personSearch);
      params.set("limit", "20");

      const response = await fetch(`/api/persons?${params}`);
      if (response.ok) {
        const data = await response.json();
        // Filter out persons already shareholders in this fund
        const existingPersonIds = existingShareholders.map((sh) => sh.person.id);
        const available = (data.data || data || []).filter(
          (p: Person) => !existingPersonIds.includes(p.id)
        );
        setPersons(available);
      }
    } catch {
      // Person fetch failed silently
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreatePerson() {
    try {
      setIsCreatingPerson(true);
      const response = await fetch("/api/persons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personType: newPersonType,
          firstName: newPersonType === "natural" ? newPersonData.firstName : null,
          lastName: newPersonType === "natural" ? newPersonData.lastName : null,
          companyName: newPersonType === "legal" ? newPersonData.companyName : null,
          email: newPersonData.email || null,
          phone: newPersonData.phone || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Erstellen");
      }

      const newPerson = await response.json();
      setSelectedPerson(newPerson);
      setStep("enter-details");
      toast.success("Person wurde erstellt");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Erstellen der Person");
    } finally {
      setIsCreatingPerson(false);
    }
  }

  async function handleSave() {
    if (!selectedPerson) return;

    try {
      setIsSaving(true);
      const response = await fetch("/api/shareholders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fundId,
          personId: selectedPerson.id,
          shareholderNumber: shareholderNumber || null,
          entryDate: entryDate?.toISOString() || null,
          capitalContribution: capitalContribution ? parseFloat(capitalContribution) : null,
          notes: notes || null,
          status: "ACTIVE",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }

      toast.success("Gesellschafter wurde hinzugefügt");
      setIsOpen(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gesellschafter hinzufügen</DialogTitle>
          <DialogDescription>
            Fuegen Sie einen neuen Gesellschafter zu {fundName} hinzu.
          </DialogDescription>
        </DialogHeader>

        {step === "select-person" && (
          <div className="space-y-4 py-4">
            {/* Search existing persons */}
            <div className="space-y-2">
              <Label>Person suchen oder neu erstellen</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Name oder E-Mail eingeben..."
                  value={personSearch}
                  onChange={(e) => setPersonSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Person list */}
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : persons.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {personSearch ? "Keine Personen gefunden" : "Personen werden geladen..."}
                </p>
              ) : (
                persons.map((person) => (
                  <button
                    key={person.id}
                    onClick={() => {
                      setSelectedPerson(person);
                      setStep("enter-details");
                    }}
                    className="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-muted"
                  >
                    {person.personType === "legal" ? (
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <User className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium">{getPersonName(person)}</p>
                      {person.email && (
                        <p className="text-sm text-muted-foreground">{person.email}</p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>

            <Separator />

            {/* Create new person */}
            <div className="space-y-4">
              <Label>Oder neue Person anlegen:</Label>
              <RadioGroup
                value={newPersonType}
                onValueChange={(v) => setNewPersonType(v as "natural" | "legal")}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="natural" id="natural" />
                  <Label htmlFor="natural" className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Natuerliche Person
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="legal" id="legal" />
                  <Label htmlFor="legal" className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Unternehmen
                  </Label>
                </div>
              </RadioGroup>

              <div className="grid gap-4 md:grid-cols-2">
                {newPersonType === "natural" ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="firstName">Vorname</Label>
                      <Input
                        id="firstName"
                        value={newPersonData.firstName}
                        onChange={(e) =>
                          setNewPersonData({ ...newPersonData, firstName: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Nachname</Label>
                      <Input
                        id="lastName"
                        value={newPersonData.lastName}
                        onChange={(e) =>
                          setNewPersonData({ ...newPersonData, lastName: e.target.value })
                        }
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="companyName">Firmenname</Label>
                    <Input
                      id="companyName"
                      value={newPersonData.companyName}
                      onChange={(e) =>
                        setNewPersonData({ ...newPersonData, companyName: e.target.value })
                      }
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">E-Mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newPersonData.email}
                    onChange={(e) =>
                      setNewPersonData({ ...newPersonData, email: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefon</Label>
                  <Input
                    id="phone"
                    value={newPersonData.phone}
                    onChange={(e) =>
                      setNewPersonData({ ...newPersonData, phone: e.target.value })
                    }
                  />
                </div>
              </div>

              <Button
                onClick={handleCreatePerson}
                disabled={
                  isCreatingPerson ||
                  (newPersonType === "natural"
                    ? !newPersonData.firstName || !newPersonData.lastName
                    : !newPersonData.companyName)
                }
              >
                {isCreatingPerson && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Plus className="mr-2 h-4 w-4" />
                Person anlegen und weiter
              </Button>
            </div>
          </div>
        )}

        {step === "enter-details" && selectedPerson && (
          <div className="space-y-4 py-4">
            {/* Selected person info */}
            <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
              {selectedPerson.personType === "legal" ? (
                <Building2 className="h-5 w-5 text-muted-foreground" />
              ) : (
                <User className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium">{getPersonName(selectedPerson)}</p>
                {selectedPerson.email && (
                  <p className="text-sm text-muted-foreground">{selectedPerson.email}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => {
                  setStep("select-person");
                  setSelectedPerson(null);
                }}
              >
                Aendern
              </Button>
            </div>

            <Separator />

            {/* Shareholder details */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="shareholderNumber">Gesellschafternummer</Label>
                <Input
                  id="shareholderNumber"
                  placeholder="z.B. KOM-001"
                  value={shareholderNumber}
                  onChange={(e) => setShareholderNumber(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Eintrittsdatum</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <Calendar className="mr-2 h-4 w-4" />
                      {entryDate ? format(entryDate, "dd.MM.yyyy") : "Datum waehlen"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarComponent
                      mode="single"
                      selected={entryDate}
                      onSelect={setEntryDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label htmlFor="capitalContribution">Kapitaleinlage (EUR)</Label>
                <Input
                  id="capitalContribution"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="z.B. 25000"
                  value={capitalContribution}
                  onChange={(e) => setCapitalContribution(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Berechneter Anteil</Label>
                <div className="flex h-10 items-center rounded-md border bg-muted px-3">
                  <span className="font-mono">{calculatedPercentage}%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Wird automatisch aus der Einlage berechnet
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notizen</Label>
              <Textarea
                id="notes"
                placeholder="Optionale Bemerkungen..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Summary */}
            {capitalContribution && (
              <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                <p>
                  <strong>Zusammenfassung:</strong> {getPersonName(selectedPerson)} wird mit einer
                  Einlage von {formatCurrency(parseFloat(capitalContribution))} als Gesellschafter
                  hinzugefügt. Das entspricht einem Anteil von ca. {calculatedPercentage}%.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Abbrechen
          </Button>
          {step === "enter-details" && (
            <Button onClick={handleSave} disabled={isSaving || !selectedPerson}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Gesellschafter hinzufügen
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================
// Edit Shareholder Dialog
// =====================

interface EditShareholderDialogProps {
  fundId: string;
  totalCapital?: number | null;
  existingShareholders: Shareholder[];
  shareholder: Shareholder | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSuccess: () => void;
}

function EditShareholderDialog({
  fundId,
  totalCapital,
  existingShareholders,
  shareholder,
  isOpen,
  setIsOpen,
  onSuccess,
}: EditShareholderDialogProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);

  const [shareholderNumber, setShareholderNumber] = useState("");
  const [entryDate, setEntryDate] = useState<Date | undefined>();
  const [exitDate, setExitDate] = useState<Date | undefined>();
  const [capitalContribution, setCapitalContribution] = useState("");
  const [votingRights, setVotingRights] = useState("");
  const [distributionPercentage, setDistributionPercentage] = useState("");
  const [status, setStatus] = useState<"ACTIVE" | "INACTIVE" | "ARCHIVED">("ACTIVE");
  const [notes, setNotes] = useState("");

  // Use fund's Stammkapital as denominator; fall back to sum of contributions
  const otherShareholdersCapital = existingShareholders
    .filter((sh) => sh.status === "ACTIVE" && sh.id !== shareholder?.id)
    .reduce((sum, sh) => sum + (sh.capitalContribution || 0), 0);
  const stammkapital = totalCapital && totalCapital > 0 ? totalCapital : null;

  // Calculate ownership percentage
  const calculatedPercentage = capitalContribution
    ? stammkapital
      ? ((parseFloat(capitalContribution) / stammkapital) * 100).toFixed(2)
      : ((parseFloat(capitalContribution) / (otherShareholdersCapital + parseFloat(capitalContribution))) * 100).toFixed(2)
    : "0.00";

  // Populate form when shareholder changes
  useEffect(() => {
    if (shareholder) {
      setShareholderNumber(shareholder.shareholderNumber || "");
      setEntryDate(shareholder.entryDate ? new Date(shareholder.entryDate) : undefined);
      setExitDate(shareholder.exitDate ? new Date(shareholder.exitDate) : undefined);
      setCapitalContribution(shareholder.capitalContribution?.toString() || "");
      setVotingRights(shareholder.votingRightsPercentage?.toString() || "");
      setDistributionPercentage(shareholder.distributionPercentage?.toString() || "");
      setStatus(shareholder.status);
      setNotes(shareholder.notes || "");
    }
  }, [shareholder]);

  async function handleSave() {
    if (!shareholder) return;

    try {
      setIsSaving(true);
      const response = await fetch(`/api/shareholders/${shareholder.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shareholderNumber: shareholderNumber || null,
          entryDate: entryDate?.toISOString() || null,
          exitDate: exitDate?.toISOString() || null,
          capitalContribution: capitalContribution ? parseFloat(capitalContribution) : null,
          votingRightsPercentage: votingRights ? parseFloat(votingRights) : null,
          distributionPercentage: distributionPercentage ? parseFloat(distributionPercentage) : null,
          status,
          notes: notes || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }

      toast.success("Änderungen wurden gespeichert");
      setIsOpen(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setIsSaving(false);
    }
  }

  function handleArchive() {
    setArchiveDialogOpen(true);
  }

  async function handleConfirmArchive() {
    if (!shareholder) return;

    try {
      setIsArchiving(true);
      const response = await fetch(`/api/shareholders/${shareholder.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Archivieren");
      }

      toast.success("Gesellschafter wurde archiviert");
      setArchiveDialogOpen(false);
      setIsOpen(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Archivieren");
    } finally {
      setIsArchiving(false);
    }
  }

  if (!shareholder) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gesellschafter bearbeiten</DialogTitle>
          <DialogDescription>
            {getPersonName(shareholder.person)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-shareholderNumber">Gesellschafternummer</Label>
              <Input
                id="edit-shareholderNumber"
                value={shareholderNumber}
                onChange={(e) => setShareholderNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger id="edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Aktiv</SelectItem>
                  <SelectItem value="INACTIVE">Inaktiv</SelectItem>
                  <SelectItem value="ARCHIVED">Archiviert</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Eintrittsdatum</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <Calendar className="mr-2 h-4 w-4" />
                    {entryDate ? format(entryDate, "dd.MM.yyyy") : "Datum waehlen"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={entryDate}
                    onSelect={setEntryDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Austrittsdatum</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <Calendar className="mr-2 h-4 w-4" />
                    {exitDate ? format(exitDate, "dd.MM.yyyy") : "Kein Austritt"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={exitDate}
                    onSelect={setExitDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-capitalContribution">Kapitaleinlage (EUR)</Label>
              <Input
                id="edit-capitalContribution"
                type="number"
                min="0"
                step="0.01"
                value={capitalContribution}
                onChange={(e) => setCapitalContribution(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Berechneter Anteil</Label>
              <div className="flex h-10 items-center rounded-md border bg-muted px-3">
                <span className="font-mono">{calculatedPercentage}%</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-votingRights">Stimmrechte (%)</Label>
              <Input
                id="edit-votingRights"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={votingRights}
                onChange={(e) => setVotingRights(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-distributionPercentage">Ausschuettungsanteil (%)</Label>
              <Input
                id="edit-distributionPercentage"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={distributionPercentage}
                onChange={(e) => setDistributionPercentage(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notizen</Label>
            <Textarea
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="destructive"
            onClick={handleArchive}
            disabled={isArchiving || shareholder.status === "ARCHIVED"}
            className="sm:mr-auto"
          >
            {isArchiving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Archivieren
          </Button>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Archive Confirmation Dialog */}
      <DeleteConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        onConfirm={handleConfirmArchive}
        title="Archivieren bestätigen"
        description="Möchten Sie diesen Gesellschafter wirklich archivieren?"
      />
    </Dialog>
  );
}

// =====================
// Shareholder Detail Dialog
// =====================

interface ShareholderDetailDialogProps {
  shareholder: Shareholder | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onEdit: () => void;
}

function ShareholderDetailDialog({
  shareholder,
  isOpen,
  setIsOpen,
  onEdit,
}: ShareholderDetailDialogProps) {
  const [shareholderDetail, setShareholderDetail] = useState<ShareholderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<ShareholderDocument | null>(null);

  useEffect(() => {
    if (isOpen && shareholder) {
      fetchShareholderDetail();
    }
  }, [isOpen, shareholder?.id]);

  async function fetchShareholderDetail() {
    if (!shareholder) return;
    try {
      setLoading(true);
      const response = await fetch(`/api/shareholders/${shareholder.id}`);
      if (response.ok) {
        const data = await response.json();
        setShareholderDetail(data);
      }
    } catch {
      // Shareholder detail fetch failed silently
    } finally {
      setLoading(false);
    }
  }

  if (!shareholder) return null;

  const person = shareholder.person;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {person.personType === "legal" ? (
              <Building2 className="h-6 w-6 text-muted-foreground" />
            ) : (
              <User className="h-6 w-6 text-muted-foreground" />
            )}
            <div>
              <DialogTitle>{getPersonName(person)}</DialogTitle>
              <DialogDescription>
                {person.personType === "legal" ? "Unternehmen" : "Natuerliche Person"} •{" "}
                {shareholder.shareholderNumber || "Keine Nummer"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Status & Key Metrics */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wallet className="h-4 w-4" />
                Kapitaleinlage
              </div>
              <p className="mt-1 text-lg font-semibold">
                {shareholder.capitalContribution
                  ? formatCurrency(shareholder.capitalContribution)
                  : "-"}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Percent className="h-4 w-4" />
                Anteil
              </div>
              <p className="mt-1 text-lg font-semibold">
                {shareholder.ownershipPercentage != null
                  ? `${Number(shareholder.ownershipPercentage).toFixed(2)}%`
                  : "-"}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                Status
              </div>
              <Badge variant="secondary" className={`mt-1 ${statusColors[shareholder.status]}`}>
                {statusLabels[shareholder.status]}
              </Badge>
            </div>
          </div>

          <Separator />

          {/* Contact Info */}
          <div>
            <h4 className="mb-3 font-medium">Kontaktdaten</h4>
            <div className="grid gap-3 md:grid-cols-2">
              {person.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${person.email}`} className="text-primary hover:underline">
                    {person.email}
                  </a>
                </div>
              )}
              {person.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${person.phone}`} className="text-primary hover:underline">
                    {person.phone}
                  </a>
                </div>
              )}
              {person.mobile && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{person.mobile}</span>
                </div>
              )}
              {(person.street || person.houseNumber || person.postalCode || person.city) && (
                <div className="flex items-start gap-2 text-sm md:col-span-2">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div className="text-sm">
                    {[person.street, person.houseNumber].filter(Boolean).join(" ")}
                    {(person.street || person.houseNumber) && (person.postalCode || person.city) && <br />}
                    {[person.postalCode, person.city].filter(Boolean).join(" ")}
                  </div>
                </div>
              )}
              {!person.email && !person.phone && !person.mobile && !person.street && !person.city && (
                <p className="text-sm text-muted-foreground md:col-span-2">
                  Keine Kontaktdaten hinterlegt
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* Participation Details */}
          <div>
            <h4 className="mb-3 font-medium">Beteiligungsdetails</h4>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Eintrittsdatum</span>
                <span>
                  {shareholder.entryDate
                    ? format(new Date(shareholder.entryDate), "dd.MM.yyyy", { locale: de })
                    : "-"}
                </span>
              </div>
              {shareholder.exitDate && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Austrittsdatum</span>
                  <span>
                    {format(new Date(shareholder.exitDate), "dd.MM.yyyy", { locale: de })}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Stimmrechte</span>
                <span>
                  {shareholder.votingRightsPercentage != null
                    ? `${Number(shareholder.votingRightsPercentage).toFixed(2)}%`
                    : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Ausschuettungsanteil</span>
                <span>
                  {shareholder.distributionPercentage != null
                    ? `${Number(shareholder.distributionPercentage).toFixed(2)}%`
                    : "-"}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {shareholder.notes && (
            <>
              <Separator />
              <div>
                <h4 className="mb-2 font-medium">Notizen</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {shareholder.notes}
                </p>
              </div>
            </>
          )}

          {/* Documents Section */}
          <Separator />
          <div>
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Dokumente ({shareholderDetail?._count?.documents || 0})
              </h4>
              <Button size="sm" asChild>
                <Link href={`/documents/upload?shareholderId=${shareholder.id}`}>
                  <Upload className="mr-2 h-4 w-4" />
                  Hochladen
                </Link>
              </Button>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !shareholderDetail?.documents || shareholderDetail.documents.length === 0 ? (
              <div className="py-4 text-center text-muted-foreground">
                <FileText className="mx-auto h-8 w-8 opacity-50 mb-2" />
                <p className="text-sm">Keine Dokumente vorhanden</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dokument</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead className="w-[80px]">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shareholderDetail.documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{doc.title}</p>
                          <p className="text-xs text-muted-foreground">{doc.fileName}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(doc.createdAt), "dd.MM.yyyy", { locale: de })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setPreviewDocument(doc);
                              setPreviewOpen(true);
                            }}
                            title="Vorschau"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => window.open(doc.fileUrl, "_blank")}
                            title="Herunterladen"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Schliessen
          </Button>
          <Button onClick={onEdit}>
            Bearbeiten
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Document Preview Dialog */}
      <DocumentPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        document={previewDocument}
      />
    </Dialog>
  );
}
