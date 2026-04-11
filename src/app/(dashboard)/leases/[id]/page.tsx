"use client";

import { useState, useEffect, use } from "react";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { FileUploadDropzone } from "@/components/ui/file-upload-dropzone";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { format, differenceInDays } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { formatCurrency } from "@/lib/format";
import {
  ArrowLeft,
  Trash2,
  MapPin,
  Calendar,
  Euro,
  User,
  Building2,
  FileText,
  Clock,
  AlertTriangle,
  Wind,
  Check,
  Repeat,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { CONTRACT_STATUS, getStatusBadge } from "@/lib/status-config";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface Plot {
  id: string;
  cadastralDistrict: string | null;
  fieldNumber: string | null;
  plotNumber: string | null;
  areaSqm: number | null;
  usageType: string | null;
  county: string | null;
  municipality: string | null;
  park: {
    id: string;
    name: string;
    shortName: string | null;
    city: string | null;
  } | null;
}

interface UsageTypeWithSize {
  id: string;
  sizeSqm: string;
}

interface Lease {
  id: string;
  signedDate: string | null;
  startDate: string;
  endDate: string | null;
  status: string;
  hasExtensionOption: boolean;
  extensionDetails: string | null;
  hasWaitingMoney: boolean;
  waitingMoneyAmount: number | null;
  waitingMoneyUnit: string | null;
  waitingMoneySchedule: string | null;
  usageTypes: string[];
  usageTypesWithSize: UsageTypeWithSize[] | null;
  billingInterval: string | null;
  linkedTurbineId: string | null;
  contractDocumentUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  plots: Plot[];
  lessor: {
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
    bankIban: string | null;
    bankName: string | null;
  };
}

export default function LeaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const { flags } = useFeatureFlags();
  const t = useTranslations("leases.detail");
  const locale = useLocale();
  const dateLocale = locale === "en" ? enUS : de;
  const numberLocale = locale === "en" ? "en-US" : "de-DE";
  const BILLING_INTERVAL_LABELS: Record<string, string> = {
    MONTHLY: t("billingIntervals.MONTHLY"),
    QUARTERLY: t("billingIntervals.QUARTERLY"),
    SEMI_ANNUAL: t("billingIntervals.SEMI_ANNUAL"),
    ANNUAL: t("billingIntervals.ANNUAL"),
  };
  const WAITING_MONEY_SCHEDULE_LABELS: Record<string, string> = {
    once: t("waitingMoneySchedules.once"),
    monthly: t("waitingMoneySchedules.monthly"),
    yearly: t("waitingMoneySchedules.yearly"),
  };
  const [lease, setLease] = useState<Lease | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function fetchLease() {
      try {
        const response = await fetch(`/api/leases/${resolvedParams.id}`);
        if (!response.ok) {
          if (response.status === 404) {
            toast.error(t("notFound"));
            router.push("/leases");
            return;
          }
          throw new Error(t("loadError"));
        }
        const data = await response.json();
        setLease(data);
      } catch {
        toast.error(t("loadErrorToast"));
      } finally {
        setLoading(false);
      }
    }

    fetchLease();
  }, [resolvedParams.id, router, t]);

  async function handleDelete() {
    setDeleting(true);
    try {
      const response = await fetch(`/api/leases/${resolvedParams.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(t("deleteError"));
      }

      toast.success(t("deleteSuccess"));
      router.push("/leases");
    } catch {
      toast.error(t("deleteErrorToast"));
    } finally {
      setDeleting(false);
    }
  }

  function getLessorName(): string {
    if (!lease) return "-";
    if (lease.lessor.personType === "legal") {
      return lease.lessor.companyName || "-";
    }
    return [lease.lessor.firstName, lease.lessor.lastName].filter(Boolean).join(" ") || "-";
  }

  function _getPlotLabel(plot: Plot): string {
    const parts = [
      plot.cadastralDistrict,
      plot.fieldNumber && plot.fieldNumber !== "0" ? `Flur ${plot.fieldNumber}` : null,
      plot.plotNumber ? `Flurst\u00fcck ${plot.plotNumber}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "-";
  }

  function getDaysUntilEnd(): number | null {
    if (!lease?.endDate) return null;
    return differenceInDays(new Date(lease.endDate), new Date());
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-10 w-64" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!lease) {
    return null;
  }

  const daysUntilEnd = getDaysUntilEnd();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/leases">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">
                {t("title")}
              </h1>
              <Badge variant="secondary" className={getStatusBadge(CONTRACT_STATUS, lease.status).className}>
                {getStatusBadge(CONTRACT_STATUS, lease.status).label}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {getLessorName()}
              {lease.plots.length > 0 && ` \u2014 ${lease.plots.length === 1 ? t("plotsCount", { count: lease.plots.length }) : t("plotsCountPlural", { count: lease.plots.length })}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={deleting}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t("delete")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("deleteDialogTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("deleteDialogDescription")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                  {t("delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Warning Banner - Vertrag läuft aus */}
      {daysUntilEnd !== null && daysUntilEnd > 0 && daysUntilEnd <= 90 && (
        <div className="flex items-center gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg dark:bg-yellow-950/30 dark:border-yellow-800">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
          <div>
            <p className="font-medium text-yellow-800 dark:text-yellow-400">
              {t("expiringWarning", { days: daysUntilEnd })}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Flurstücke */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {t("plots.title", { count: lease.plots?.length || 0 })}
              <InfoTooltip text={t("plots.tooltip")} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {lease.plots && lease.plots.length > 0 ? (
              lease.plots.map((plot, index) => (
                <div key={plot.id}>
                  {index > 0 && <Separator className="my-4" />}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">{t("plots.district")}</p>
                      <p className="font-medium">{plot.cadastralDistrict || "-"}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t("plots.fieldAndParcel")}</p>
                      <p className="font-medium">
                        {plot.fieldNumber && plot.fieldNumber !== "0" ? `${plot.fieldNumber} / ` : ""}
                        {plot.plotNumber || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t("plots.area")}</p>
                      <p className="font-medium">
                        {plot.areaSqm
                          ? `${Number(plot.areaSqm).toLocaleString(numberLocale)} m\u00b2 (${(Number(plot.areaSqm) / 10000).toFixed(2)} ha)`
                          : "-"}
                      </p>
                    </div>
                    {plot.park && (
                      <div>
                        <p className="text-sm text-muted-foreground">{t("plots.park")}</p>
                        <p className="font-medium flex items-center gap-1">
                          <Wind className="h-3 w-3" />
                          {plot.park.name}
                          {plot.park.city && ` (${plot.park.city})`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-4">
                <MapPin className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-muted-foreground">{t("plots.empty")}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("plots.emptyHintPrefix")}{" "}
                  <Link href={`/leases/${lease.id}/edit`} className="text-primary underline underline-offset-4 hover:text-primary/80">
                    {t("plots.emptyHintLink")}
                  </Link>{" "}
                  {t("plots.emptyHintSuffix")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Verpächter */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {lease.lessor.personType === "legal" ? (
                <Building2 className="h-5 w-5" />
              ) : (
                <User className="h-5 w-5" />
              )}
              {t("lessor.title")}
              <InfoTooltip text={t("lessor.tooltip")} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">{t("lessor.name")}</p>
              <Link
                href={`/crm/contacts/${lease.lessor.id}`}
                className="font-medium hover:underline hover:text-primary transition-colors inline-flex items-center gap-1"
              >
                {getLessorName()}
              </Link>
              <p className="text-xs text-muted-foreground">
                {lease.lessor.personType === "legal" ? t("lessor.legalPerson") : t("lessor.naturalPerson")}
              </p>
            </div>
            {lease.lessor.email && (
              <div>
                <p className="text-sm text-muted-foreground">{t("lessor.email")}</p>
                <p className="font-medium">{lease.lessor.email}</p>
              </div>
            )}
            {lease.lessor.phone && (
              <div>
                <p className="text-sm text-muted-foreground">{t("lessor.phone")}</p>
                <p className="font-medium">{lease.lessor.phone}</p>
              </div>
            )}
            {(lease.lessor.street || lease.lessor.city) && (
              <div>
                <p className="text-sm text-muted-foreground">{t("lessor.address")}</p>
                <p className="font-medium">
                  {lease.lessor.street && <span>{lease.lessor.street}<br /></span>}
                  {lease.lessor.postalCode} {lease.lessor.city}
                </p>
              </div>
            )}
            {lease.lessor.bankIban && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">{t("lessor.bank")}</p>
                  <p className="font-medium font-mono text-sm">{lease.lessor.bankIban}</p>
                  {lease.lessor.bankName && (
                    <p className="text-sm text-muted-foreground">{lease.lessor.bankName}</p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Vertragslaufzeit */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t("term.title")}
              <InfoTooltip text={t("term.tooltip")} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {lease.signedDate && (
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground">{t("term.signed")}</p>
                  <p className="font-medium">
                    {format(new Date(lease.signedDate), "dd.MM.yyyy", { locale: dateLocale })}
                  </p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">{t("term.start")}</p>
                <p className="font-medium">
                  {format(new Date(lease.startDate), "dd.MM.yyyy", { locale: dateLocale })}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t("term.end")}</p>
                <p className="font-medium">
                  {lease.endDate
                    ? format(new Date(lease.endDate), "dd.MM.yyyy", { locale: dateLocale })
                    : t("term.unlimited")}
                </p>
              </div>
              {daysUntilEnd !== null && (
                <div>
                  <p className="text-sm text-muted-foreground">{t("term.remaining")}</p>
                  <p className={`font-medium ${daysUntilEnd <= 90 ? "text-yellow-600" : ""}`}>
                    {daysUntilEnd > 0 ? t("term.daysRemaining", { days: daysUntilEnd }) : t("term.expired")}
                  </p>
                </div>
              )}
            </div>

            {/* Verlängerungsoption */}
            {lease.hasExtensionOption && (
              <>
                <Separator />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Repeat className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">{t("term.extensionOption")}</p>
                    <Check className="h-4 w-4 text-green-600" />
                  </div>
                  {lease.extensionDetails && (
                    <p className="text-sm text-muted-foreground ml-6">{lease.extensionDetails}</p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Abrechnung & Konditionen */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              {t("billing.title")}
              <InfoTooltip text={t("billing.tooltip")} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">{t("billing.interval")}</p>
              <p className="font-medium">
                {BILLING_INTERVAL_LABELS[lease.billingInterval || "ANNUAL"] || lease.billingInterval || t("billingIntervals.ANNUAL")}
              </p>
            </div>

            {/* Wartegeld */}
            {lease.hasWaitingMoney && (
              <>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">{t("billing.waitingMoney")}</p>
                  <div className="flex items-center gap-2">
                    <Euro className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">
                      {lease.waitingMoneyAmount
                        ? formatCurrency(Number(lease.waitingMoneyAmount))
                        : "-"}
                      {lease.waitingMoneyUnit === "ha" && t("billing.perHa")}
                    </p>
                  </div>
                  {lease.waitingMoneySchedule && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {WAITING_MONEY_SCHEDULE_LABELS[lease.waitingMoneySchedule] || lease.waitingMoneySchedule}
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Notizen */}
        {lease.notes && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t("notes.title")}
                <InfoTooltip text={t("notes.tooltip")} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap">{lease.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Metadaten */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t("metadata.title")}
              <InfoTooltip text={t("metadata.tooltip")} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">{t("metadata.createdAt")}</p>
                <p>{format(new Date(lease.createdAt), "dd.MM.yyyy HH:mm", { locale: dateLocale })}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("metadata.updatedAt")}</p>
                <p>{format(new Date(lease.updatedAt), "dd.MM.yyyy HH:mm", { locale: dateLocale })}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("metadata.id")}</p>
                <p className="font-mono text-xs">{lease.id}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CRM Activities */}
        {flags.crm && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{t("activities")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline entityType="lease" entityId={lease.id} />
            </CardContent>
          </Card>
        )}

        {/* File Upload */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("upload.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <FileUploadDropzone
              endpoint="/api/documents"
              additionalFields={{ category: "LEASE" }}
              onUploadComplete={() => router.refresh()}
              hint={t("upload.hint")}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
