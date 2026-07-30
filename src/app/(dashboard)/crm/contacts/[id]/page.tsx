"use client";

import { use, useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  User,
  Users,
  Pencil,
  FileText,
  Building2,
  CheckSquare,
  ClipboardList,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { usePermissions } from "@/hooks/usePermissions";
import { downloadFromResponse } from "@/lib/download";
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
import { ContactEditDialog } from "@/components/crm/contact-edit-dialog";
import {
  RelatedEntitiesPanel,
  type Contact360Dto,
} from "@/components/crm/related-entities-panel";
import { ContactLinkDialog } from "@/components/crm/contact-link-dialog";
import { PersonTags, type PersonTag } from "@/components/crm/person-tags";
import { EmailLogDialog } from "@/components/crm/email-log-dialog";
import { isDerivedLabel } from "@/lib/crm/label-constants";
import { useTabParam } from "@/hooks/useTabParam";

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
  contact360: Contact360Dto;
  tags: PersonTag[];
  labels: string[];
}

const CONTACT_TYPE_KEYS = [
  "Gesellschafter",
  "Pächter",
  "Investor",
  "Partner",
  "Dienstleister",
  "Sonstiges",
] as const;

// ============================================================================
// Small presentational pieces
// ============================================================================

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-6">
        <div className="p-2 bg-primary/10 rounded-md text-primary">{icon}</div>
        <div>
          <div className="text-2xl font-bold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Page
// ============================================================================

/** Bedienaufwand #15: erlaubte Werte fuer ?tab= — alles andere faellt auf den Standard zurueck. */
const TAB_VALUES = ["overview", "relations", "activities", "tasks", "documents"] as const;

export default function CrmContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [activeTab, setActiveTab] = useTabParam("overview", { allowed: TAB_VALUES });
  const { id } = use(params);
  const router = useRouter();
  const { flags } = useFeatureFlags();
  const t = useTranslations("crm.detail");
  const tContacts = useTranslations("crm.contacts");
  const tLabels = useTranslations("crm.labels");
  const [contact, setContact] = useState<CrmContactDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const { hasPermission } = usePermissions();

  /**
   * TF-11: DSGVO-Art.-15-Auskunft herunterladen.
   *
   * Der Endpunkt liefert JSON mit allen zur Person gespeicherten Daten
   * (Stammdaten, Pachtvertraege, Vertraege, Rechnungen, CRM-Aktivitaeten und
   * die Audit-Spur) und setzt Content-Disposition selbst.
   */
  async function handleDataExport() {
    setExportingData(true);
    try {
      const res = await fetch(`/api/admin/persons/${id}/data-export`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.message ?? json?.error ?? t("dataExportError"));
      }
      await downloadFromResponse(res, `dsgvo-auskunft-${id}.json`);
      toast.success(t("dataExportSuccess"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("dataExportError"));
    } finally {
      setExportingData(false);
    }
  }

  // AbortController um stale Requests bei id-Wechsel zu cancelln.
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/contacts/${id}`, { signal: ac.signal });
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!ac.signal.aborted) setContact(data);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error(t("loadError"));
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const handleContactTypeChange = async (value: string) => {
    setSavingType(true);
    try {
      const res = await fetch(`/api/crm/contacts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactType: value === "none" ? null : value }),
      });
      if (!res.ok) throw new Error();
      setContact((prev) =>
        prev ? { ...prev, contactType: value === "none" ? null : value } : null,
      );
      toast.success(t("typeUpdated"));
    } catch {
      toast.error(t("saveError"));
    } finally {
      setSavingType(false);
    }
  };

  const displayName = contact
    ? contact.firstName || contact.lastName
      ? `${contact.salutation ? contact.salutation + " " : ""}${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim()
      : (contact.companyName ?? "—")
    : "";

  if (!flags.crm) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Users className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold">{tContacts("crmDisabled")}</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          {tContacts("crmDisabledHint")}
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
    return (
      <div className="text-center py-12 text-muted-foreground">
        {t("notFound")}
      </div>
    );
  }

  const stats = contact.contact360.stats;

  return (
    <div className="space-y-6">
      {/* Back + Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            aria-label={t("backAria")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{displayName}</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                variant={contact.status === "ACTIVE" ? "default" : "outline"}
              >
                {contact.status === "ACTIVE"
                  ? t("statusActive")
                  : contact.status}
              </Badge>
              {/* Derived labels — automatic, read-only */}
              {contact.labels
                .filter((l) => isDerivedLabel(l))
                .map((label) => (
                  <Badge key={label} variant="secondary">
                    {tLabels(label)}
                  </Badge>
                ))}
            </div>
            {/* Custom labels — editable via PersonTags popover */}
            <div className="mt-2">
              <PersonTags
                personId={id}
                tags={contact.tags}
                onChange={(newTags) =>
                  setContact((prev) =>
                    prev ? { ...prev, tags: newTags } : prev,
                  )
                }
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowEmailDialog(true)}>
            <Mail className="mr-2 h-4 w-4" />
            {t("logEmailButton")}
          </Button>
          <Button variant="outline" onClick={() => setShowEditDialog(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            {t("editButton")}
          </Button>
          {/* TF-11: /api/admin/persons/[id]/data-export war vollstaendig
              implementiert und hatte keinen UI-Aufrufer — eine
              Compliance-Pflicht (DSGVO Art. 15) ohne Oberflaeche. Der Endpunkt
              verlangt admin:audit, deshalb nur fuer Berechtigte sichtbar. */}
          {hasPermission("admin:audit") && (
            <Button
              variant="outline"
              onClick={handleDataExport}
              disabled={exportingData}
              title={t("dataExportHint")}
            >
              {exportingData ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="mr-2 h-4 w-4" />
              )}
              {t("dataExportButton")}
            </Button>
          )}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          icon={<FileText className="h-4 w-4" />}
          label={t("statLeases")}
          value={stats.leaseCount}
        />
        <StatTile
          icon={<Building2 className="h-4 w-4" />}
          label={t("statFunds")}
          value={stats.fundCount}
        />
        <StatTile
          icon={<ClipboardList className="h-4 w-4" />}
          label={t("statContracts")}
          value={stats.contractCount}
        />
        <StatTile
          icon={<CheckSquare className="h-4 w-4" />}
          label={t("statOpenTasks")}
          value={stats.openTaskCount}
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">{t("tabOverview")}</TabsTrigger>
          <TabsTrigger value="relations">
            {t("tabRelations")}
            {stats.leaseCount +
              stats.fundCount +
              stats.contractCount +
              stats.parkRoleCount >
            0 ? (
              <Badge variant="secondary" className="ml-2">
                {stats.leaseCount +
                  stats.fundCount +
                  stats.contractCount +
                  stats.parkRoleCount}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="activities">{t("tabActivities")}</TabsTrigger>
          <TabsTrigger value="tasks">
            {t("tabTasks")}
            {stats.openTaskCount > 0 ? (
              <Badge variant="destructive" className="ml-2">
                {stats.openTaskCount}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="documents">
            {t("tabDocuments")}
            {stats.documentCount > 0 ? (
              <Badge variant="secondary" className="ml-2">
                {stats.documentCount}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        {/* Übersicht Tab */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Contact Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {t("contactDataTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {contact.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={`mailto:${contact.email}`}
                      className="hover:underline"
                    >
                      {contact.email}
                    </a>
                  </div>
                )}
                {contact.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={`tel:${contact.phone}`}
                      className="hover:underline"
                    >
                      {contact.phone}
                    </a>
                  </div>
                )}
                {contact.mobile && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {contact.mobile} ({t("mobileSuffix")})
                    </span>
                  </div>
                )}
                {(contact.street || contact.city) && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      {contact.street && (
                        <div>
                          {contact.street}
                          {contact.houseNumber ? ` ${contact.houseNumber}` : ""}
                        </div>
                      )}
                      {(contact.postalCode || contact.city) && (
                        <div>
                          {[contact.postalCode, contact.city]
                            .filter(Boolean)
                            .join(" ")}
                        </div>
                      )}
                      <div className="text-muted-foreground">
                        {contact.country}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* CRM Classification */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  {t("classificationTitle")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {t("contactTypeLabel")}
                  </label>
                  <Select
                    value={contact.contactType ?? "none"}
                    onValueChange={handleContactTypeChange}
                    disabled={savingType}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("contactTypePlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        {t("contactTypeNone")}
                      </SelectItem>
                      {CONTACT_TYPE_KEYS.map((key) => (
                        <SelectItem key={key} value={key}>
                          {t(`contactTypes.${key}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {contact.notes && (
                  <>
                    <Separator />
                    <div>
                      <div className="text-sm font-medium mb-1">
                        {t("notesLabel")}
                      </div>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {contact.notes}
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Beziehungen Tab — the core of the 360° view */}
        <TabsContent value="relations" className="mt-4">
          <RelatedEntitiesPanel
            data={contact.contact360}
            onAddContactLink={() => setShowLinkDialog(true)}
          />
        </TabsContent>

        {/* Aktivitäten Tab */}
        <TabsContent value="activities" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <ActivityTimeline entityType="person" entityId={id} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aufgaben Tab — reuses ActivityTimeline with type filter via description */}
        <TabsContent value="tasks" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground mb-4">
                {t("tasksHint")}
              </div>
              <ActivityTimeline entityType="person" entityId={id} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Dokumente Tab */}
        <TabsContent value="documents" className="mt-4">
          {contact.contact360.documents.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground border rounded-md">
              {t("noDocuments")}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6 space-y-2">
                {contact.contact360.documents.map((d) => (
                  <a
                    key={d.id}
                    href={`/documents/${d.id}`}
                    className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <div className="text-sm font-medium">{d.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {d.fileName} · {d.category} · via {d.linkedVia}
                      </div>
                    </div>
                  </a>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <ContactEditDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        contact={contact}
        onSaved={load}
      />
      <ContactLinkDialog
        open={showLinkDialog}
        onOpenChange={setShowLinkDialog}
        personId={id}
        onSuccess={load}
      />
      <EmailLogDialog
        open={showEmailDialog}
        onOpenChange={setShowEmailDialog}
        personId={id}
        personContext={{
          person: {
            firstName: contact.firstName,
            lastName: contact.lastName,
            salutation: contact.salutation,
            companyName: contact.companyName,
            email: contact.email,
          },
        }}
        onSuccess={load}
      />
    </div>
  );
}
