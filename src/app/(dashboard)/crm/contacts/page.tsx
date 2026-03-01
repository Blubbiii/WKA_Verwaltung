"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { Search, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ============================================================================
// Types
// ============================================================================

interface CrmContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  contactType: string | null;
  status: string;
  lastActivityAt: string | null;
  _count: { crmActivities: number };
  shareholders: Array<{ fund: { id: string; name: string } }>;
}

const CONTACT_TYPES = [
  "Gesellschafter",
  "Pächter",
  "Investor",
  "Partner",
  "Dienstleister",
  "Sonstiges",
];

function activityAgeClass(lastActivityAt: string | null): string {
  if (!lastActivityAt) return "text-destructive";
  const days = Math.floor((Date.now() - new Date(lastActivityAt).getTime()) / 86_400_000);
  if (days < 30) return "text-green-600 dark:text-green-400";
  if (days < 90) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

// ============================================================================
// Page
// ============================================================================

interface CreateForm {
  personType: "natural" | "legal";
  salutation: string;
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  phone: string;
  contactType: string;
}

const EMPTY_FORM: CreateForm = {
  personType: "natural",
  salutation: "",
  firstName: "",
  lastName: "",
  companyName: "",
  email: "",
  phone: "",
  contactType: "",
};

export default function CrmContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [contactType, setContactType] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const body = {
        personType: form.personType,
        salutation: form.salutation || null,
        firstName: form.firstName || null,
        lastName: form.lastName || null,
        companyName: form.companyName || null,
        email: form.email || null,
        phone: form.phone || null,
        contactType: form.contactType || null,
      };
      const res = await fetch("/api/crm/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Fehler");
      }
      const created = await res.json();
      toast.success("Kontakt erstellt");
      setCreateOpen(false);
      setForm(EMPTY_FORM);
      router.push(`/crm/contacts/${created.id}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Fehler beim Erstellen");
    } finally {
      setCreating(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (search) params.set("search", search);
      if (contactType !== "all") params.set("contactType", contactType);

      const res = await fetch(`/api/crm/contacts?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setContacts(json.data ?? []);
      setTotal(json.pagination?.total ?? 0);
    } catch {
      toast.error("Kontakte konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [search, contactType]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayName = (c: CrmContact) => {
    if (c.firstName || c.lastName) return `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
    return c.companyName ?? "—";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kontakte"
        description={`${total} Kontakte im CRM`}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Neuer Kontakt
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Name, E-Mail oder Firma suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={contactType} onValueChange={setContactType}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Alle Typen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Typen</SelectItem>
            {CONTACT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setForm(EMPTY_FORM); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Neuer Kontakt</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Typ</Label>
              <Select value={form.personType} onValueChange={(v) => setForm((f) => ({ ...f, personType: v as "natural" | "legal" }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="natural">Natürliche Person</SelectItem>
                  <SelectItem value="legal">Juristische Person / Firma</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.personType === "natural" && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Anrede</Label>
                  <Select value={form.salutation || "none"} onValueChange={(v) => setForm((f) => ({ ...f, salutation: v === "none" ? "" : v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="Herr">Herr</SelectItem>
                      <SelectItem value="Frau">Frau</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Vorname</Label>
                  <input
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    placeholder="Max"
                  />
                </div>
              </div>
            )}
            {form.personType === "natural" ? (
              <div className="space-y-1.5">
                <Label>Nachname *</Label>
                <input
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  placeholder="Mustermann"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Firmenname *</Label>
                <input
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={form.companyName}
                  onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                  placeholder="Muster GmbH"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>E-Mail</Label>
              <input
                type="email"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="m.mustermann@beispiel.de"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Telefon</Label>
              <input
                type="tel"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+49 123 456789"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kontakttyp</Label>
              <Select value={form.contactType || "none"} onValueChange={(v) => setForm((f) => ({ ...f, contactType: v === "none" ? "" : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Kein Typ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kein Typ</SelectItem>
                  {CONTACT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>Abbrechen</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Speichern..." : "Kontakt anlegen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead className="hidden md:table-cell">E-Mail</TableHead>
                <TableHead className="hidden lg:table-cell">Telefon</TableHead>
                <TableHead>Letzte Aktivität</TableHead>
                <TableHead className="text-right">Aktivitäten</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : contacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    Keine Kontakte gefunden
                  </TableCell>
                </TableRow>
              ) : (
                contacts.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => router.push(`/crm/contacts/${c.id}`)}
                  >
                    <TableCell className="font-medium">{displayName(c)}</TableCell>
                    <TableCell>
                      {c.contactType ? (
                        <Badge variant="outline" className="text-xs">{c.contactType}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {c.email ?? "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {c.phone ?? c.mobile ?? "—"}
                    </TableCell>
                    <TableCell>
                      {c.lastActivityAt ? (
                        <span
                          className={`text-sm ${activityAgeClass(c.lastActivityAt)}`}
                          title={format(new Date(c.lastActivityAt), "dd.MM.yyyy HH:mm", { locale: de })}
                        >
                          {formatDistanceToNow(new Date(c.lastActivityAt), { addSuffix: true, locale: de })}
                        </span>
                      ) : (
                        <span className="text-sm text-destructive">Kein Kontakt</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{c._count.crmActivities}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
