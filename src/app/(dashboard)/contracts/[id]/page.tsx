"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Calendar,
  Building2,
  User,
  Euro,
  Clock,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Bell,
  FolderOpen,
  Info,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { ContractDocuments, ReminderSettings } from "@/components/contracts";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface ContractDetail {
  id: string;
  contractType: string;
  contractNumber: string | null;
  title: string;
  startDate: string;
  endDate: string | null;
  noticePeriodMonths: number | null;
  noticeDeadline: string | null;
  autoRenewal: boolean;
  renewalPeriodMonths: number | null;
  annualValue: number | null;
  paymentTerms: string | null;
  status: string;
  documentUrl: string | null;
  reminderDays: number[];
  notes: string | null;
  park: { id: string; name: string; shortName: string | null } | null;
  fund: { id: string; name: string } | null;
  turbine: { id: string; designation: string } | null;
  partner: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    personType: string;
  } | null;
  documents: {
    id: string;
    title: string;
    fileName: string;
    category: string;
    createdAt: string;
  }[];
  daysUntilEnd: number | null;
  daysUntilNotice: number | null;
  createdAt: string;
  updatedAt: string;
}

const typeColors: Record<string, string> = {
  LEASE: "bg-blue-100 text-blue-800",
  SERVICE: "bg-purple-100 text-purple-800",
  INSURANCE: "bg-green-100 text-green-800",
  GRID_CONNECTION: "bg-orange-100 text-orange-800",
  MARKETING: "bg-pink-100 text-pink-800",
  OTHER: "bg-gray-100 text-gray-800",
};


export default function ContractDetailPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations("contracts");
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("details");

  useEffect(() => {
    async function fetchContract() {
      try {
        const response = await fetch(`/api/contracts/${params.id}`);
        if (!response.ok) throw new Error("Fetch failed");
        const data = await response.json();
        setContract(data);
      } catch {
      } finally {
        setLoading(false);
      }
    }
    fetchContract();
  }, [params.id]);

  async function deleteContract() {
    try {
      const response = await fetch(`/api/contracts/${params.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        router.push("/contracts");
        router.refresh();
      }
    } catch {
    }
  }

  async function updateStatus(newStatus: string) {
    try {
      const response = await fetch(`/api/contracts/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        const updated = await response.json();
        setContract((prev) => (prev ? { ...prev, status: updated.status } : null));
      }
    } catch {
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-48 md:col-span-2" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/contracts">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("detail.back")}
          </Link>
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("detail.notFound")}
          </CardContent>
        </Card>
      </div>
    );
  }

  const typeColor = typeColors[contract.contractType];
  const statusConf = getStatusBadge(CONTRACT_STATUS, contract.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/contracts">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{contract.title}</h1>
              <Badge variant="secondary" className={typeColor}>
                {t(`types.${contract.contractType}`)}
              </Badge>
              <Badge variant="secondary" className={statusConf.className}>
                {statusConf.label}
              </Badge>
            </div>
            {contract.contractNumber && (
              <p className="text-muted-foreground mt-1">
                {t("detail.contractNumber")}: {contract.contractNumber}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/contracts/${contract.id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              {t("detail.editButton")}
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                {t("detail.deleteButton")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("detail.deleteTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("detail.deleteDescription", { title: contract.title })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("detail.deleteCancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={deleteContract}>{t("detail.deleteConfirm")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Warning Cards */}
      {contract.daysUntilNotice !== null && contract.daysUntilNotice <= 30 && contract.daysUntilNotice > 0 && (
        <Card className="border-orange-500 bg-orange-50">
          <CardContent className="flex items-center gap-4 py-4">
            <AlertTriangle className="h-8 w-8 text-orange-600" />
            <div>
              <p className="font-semibold text-orange-800">{t("detail.noticeWarningTitle")}</p>
              <p className="text-sm text-orange-700">
                {t("detail.noticeWarningText", {
                  days: contract.daysUntilNotice,
                  date: format(new Date(contract.noticeDeadline!), "dd.MM.yyyy", { locale: de }),
                })}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {contract.daysUntilEnd !== null && contract.daysUntilEnd <= 30 && contract.daysUntilEnd > 0 && (
        <Card className="border-red-500 bg-red-50">
          <CardContent className="flex items-center gap-4 py-4">
            <Clock className="h-8 w-8 text-red-600" />
            <div>
              <p className="font-semibold text-red-800">{t("detail.expiryWarningTitle")}</p>
              <p className="text-sm text-red-700">
                {t("detail.expiryWarningText", {
                  days: contract.daysUntilEnd,
                  date: format(new Date(contract.endDate!), "dd.MM.yyyy", { locale: de }),
                })}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="details" className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            {t("detail.tabDetails")}
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            {t("detail.tabDocuments")}
            {contract.documents.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {contract.documents.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="reminders" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            {t("detail.tabReminders")}
            {contract.reminderDays.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {contract.reminderDays.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Main Details */}
            <Card className="md:col-span-2">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle>{t("detail.contractDetails")}</CardTitle>
                  <InfoTooltip text={t("detail.contractDetailsTooltip")} />
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Dates */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {t("detail.duration")}
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-sm text-muted-foreground">{t("detail.startDate")}</p>
                      <p className="font-medium">
                        {format(new Date(contract.startDate), "dd. MMMM yyyy", { locale: de })}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{t("detail.endDate")}</p>
                      <p className="font-medium">
                        {contract.endDate
                          ? format(new Date(contract.endDate), "dd. MMMM yyyy", { locale: de })
                          : t("detail.unlimited")}
                      </p>
                    </div>
                    {contract.noticePeriodMonths && (
                      <div>
                        <p className="text-sm text-muted-foreground">{t("detail.noticePeriod")}</p>
                        <p className="font-medium">{t("detail.noticePeriodMonths", { months: contract.noticePeriodMonths })}</p>
                      </div>
                    )}
                    {contract.noticeDeadline && (
                      <div>
                        <p className="text-sm text-muted-foreground">{t("detail.noticeDeadline")}</p>
                        <p className="font-medium">
                          {format(new Date(contract.noticeDeadline), "dd. MMMM yyyy", {
                            locale: de,
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                  {contract.autoRenewal && (
                    <div className="mt-4 flex items-center gap-2 text-blue-600">
                      <RefreshCw className="h-4 w-4" />
                      <span>
                        {t("detail.autoRenewal", { months: contract.renewalPeriodMonths || 12 })}
                      </span>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Financial */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Euro className="h-4 w-4" />
                    {t("detail.financial")}
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-sm text-muted-foreground">{t("detail.annualValue")}</p>
                      <p className="font-medium text-lg">
                        {formatCurrency(contract.annualValue)}
                      </p>
                    </div>
                    {contract.paymentTerms && (
                      <div>
                        <p className="text-sm text-muted-foreground">{t("detail.paymentTerms")}</p>
                        <p className="font-medium">{contract.paymentTerms}</p>
                      </div>
                    )}
                  </div>
                </div>

                {contract.notes && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="font-semibold mb-3">{t("detail.notes")}</h3>
                      <p className="text-muted-foreground whitespace-pre-wrap">
                        {contract.notes}
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Status Actions */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle>{t("detail.statusTitle")}</CardTitle>
                    <InfoTooltip text={t("detail.statusTooltip")} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Badge variant="secondary" className={`${statusConf.className} text-base px-3 py-1`}>
                    {statusConf.label}
                  </Badge>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {contract.status !== "ACTIVE" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus("ACTIVE")}
                      >
                        <CheckCircle className="mr-1 h-3 w-3" />
                        {t("detail.activate")}
                      </Button>
                    )}
                    {contract.status === "ACTIVE" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateStatus("TERMINATED")}
                      >
                        {t("detail.terminate")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Associations */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle>{t("detail.assignmentsTitle")}</CardTitle>
                    <InfoTooltip text={t("detail.assignmentsTooltip")} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {contract.park && (
                    <div className="flex items-start gap-3">
                      <Building2 className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">{t("detail.windpark")}</p>
                        <Link
                          href={`/parks/${contract.park.id}`}
                          className="font-medium hover:underline"
                        >
                          {contract.park.shortName || contract.park.name}
                        </Link>
                      </div>
                    </div>
                  )}
                  {contract.fund && (
                    <div className="flex items-start gap-3">
                      <Euro className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">{t("detail.fund")}</p>
                        <Link
                          href={`/funds/${contract.fund.id}`}
                          className="font-medium hover:underline"
                        >
                          {contract.fund.name}
                        </Link>
                      </div>
                    </div>
                  )}
                  {contract.partner && (
                    <div className="flex items-start gap-3">
                      <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">{t("detail.partner")}</p>
                        <p className="font-medium">{contract.partner.name}</p>
                        {contract.partner.email && (
                          <a
                            href={`mailto:${contract.partner.email}`}
                            className="text-sm text-muted-foreground hover:underline"
                          >
                            {contract.partner.email}
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                  {!contract.park && !contract.fund && !contract.partner && (
                    <p className="text-sm text-muted-foreground">{t("detail.noAssignments")}</p>
                  )}
                </CardContent>
              </Card>

              {/* Quick Info */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle>{t("detail.infoTitle")}</CardTitle>
                    <InfoTooltip text={t("detail.infoTooltip")} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("detail.created")}</span>
                    <span>{format(new Date(contract.createdAt), "dd.MM.yyyy", { locale: de })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("detail.updated")}</span>
                    <span>{format(new Date(contract.updatedAt), "dd.MM.yyyy", { locale: de })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("detail.documents")}</span>
                    <span>{contract.documents.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("detail.reminders")}</span>
                    <span>{contract.reminderDays.length}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <ContractDocuments contractId={contract.id} />
        </TabsContent>

        {/* Reminders Tab */}
        <TabsContent value="reminders">
          <ReminderSettings
            contractId={contract.id}
            initialReminderDays={contract.reminderDays}
            endDate={contract.endDate}
            onUpdate={(newDays) => {
              setContract((prev) => prev ? { ...prev, reminderDays: newDays } : null);
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
