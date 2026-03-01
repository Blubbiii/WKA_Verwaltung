"use client";

import { use, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Mail, Phone, MapPin, Building2, User, Users } from "lucide-react";
import { toast } from "sonner";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ActivityTimeline } from "@/components/crm/activity-timeline";

// ============================================================================
// Types
// ============================================================================

interface CrmContactDetail {
  id: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  salutation: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  contactType: string | null;
  status: string;
  notes: string | null;
  lastActivityAt: string | null;
  shareholders: Array<{
    fund: { id: string; name: string; legalForm: string | null };
  }>;
  leases: Array<{
    id: string;
    startDate: string;
    endDate: string | null;
    status: string;
  }>;
}

const CONTACT_TYPES = [
  "Gesellschafter",
  "Pächter",
  "Investor",
  "Partner",
  "Dienstleister",
  "Sonstiges",
];

// ============================================================================
// Page
// ============================================================================

export default function CrmContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { flags } = useFeatureFlags();
  const [contact, setContact] = useState<CrmContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/contacts/${id}`);
      if (!res.ok) throw new Error();
      setContact(await res.json());
    } catch {
      toast.error("Kontakt konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleContactTypeChange = async (value: string) => {
    setSavingType(true);
    try {
      const res = await fetch(`/api/crm/contacts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactType: value === "none" ? null : value }),
      });
      if (!res.ok) throw new Error();
      setContact((prev) => prev ? { ...prev, contactType: value === "none" ? null : value } : null);
      toast.success("Typ aktualisiert");
    } catch {
      toast.error("Fehler beim Speichern");
    } finally {
      setSavingType(false);
    }
  };

  const displayName = contact
    ? contact.firstName || contact.lastName
      ? `${contact.salutation ? contact.salutation + " " : ""}${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim()
      : contact.companyName ?? "—"
    : "";

  if (!flags.crm) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Users className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold">CRM nicht aktiviert</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Das CRM-Modul ist für diesen Mandanten nicht freigeschaltet. Bitte wenden Sie sich an Ihren Administrator.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!contact) {
    return <div className="text-center py-12 text-muted-foreground">Kontakt nicht gefunden.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{displayName}</h1>
          <div className="flex items-center gap-2 mt-1">
            {contact.contactType ? (
              <Badge variant="secondary">{contact.contactType}</Badge>
            ) : null}
            <Badge variant={contact.status === "ACTIVE" ? "default" : "outline"}>
              {contact.status === "ACTIVE" ? "Aktiv" : contact.status}
            </Badge>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="activities">Aktivitäten</TabsTrigger>
          <TabsTrigger value="relations">Verknüpfungen</TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Contact Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Kontaktdaten
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {contact.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a>
                  </div>
                )}
                {contact.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${contact.phone}`} className="hover:underline">{contact.phone}</a>
                  </div>
                )}
                {contact.mobile && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{contact.mobile} (Mobil)</span>
                  </div>
                )}
                {(contact.street || contact.city) && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      {contact.street && (
                        <div>{contact.street}{contact.houseNumber ? ` ${contact.houseNumber}` : ""}</div>
                      )}
                      {(contact.postalCode || contact.city) && (
                        <div>{[contact.postalCode, contact.city].filter(Boolean).join(" ")}</div>
                      )}
                      <div className="text-muted-foreground">{contact.country}</div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* CRM Classification */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">CRM-Klassifizierung</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Kontakttyp</label>
                  <Select
                    value={contact.contactType ?? "none"}
                    onValueChange={handleContactTypeChange}
                    disabled={savingType}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Typ wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Kein Typ</SelectItem>
                      {CONTACT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {contact.notes && (
                  <>
                    <Separator />
                    <div>
                      <div className="text-sm font-medium mb-1">Notizen</div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{contact.notes}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Activities Tab */}
        <TabsContent value="activities" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <ActivityTimeline entityType="person" entityId={id} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Relations Tab */}
        <TabsContent value="relations" className="mt-4 space-y-4">
          {/* Funds */}
          {contact.shareholders.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Beteiligungen ({contact.shareholders.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {contact.shareholders.map((sh, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="font-medium">{sh.fund.name}</span>
                      {sh.fund.legalForm && (
                        <Badge variant="outline" className="text-xs">{sh.fund.legalForm}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Leases */}
          {contact.leases.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Pachtverträge ({contact.leases.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {contact.leases.map((l) => (
                    <div key={l.id} className="flex items-center justify-between text-sm">
                      <span>ab {new Date(l.startDate).toLocaleDateString("de-DE")}</span>
                      <Badge variant={l.status === "ACTIVE" ? "default" : "outline"} className="text-xs">
                        {l.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {contact.shareholders.length === 0 && contact.leases.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Keine Verknüpfungen vorhanden
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
