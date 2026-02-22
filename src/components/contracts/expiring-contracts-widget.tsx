"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { format, differenceInDays } from "date-fns";
import { de } from "date-fns/locale";
import {
  AlertTriangle,
  Clock,
  FileText,
  ChevronRight,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

interface ExpiringContract {
  id: string;
  title: string;
  contractNumber: string | null;
  contractType: string;
  endDate: string;
  noticeDeadline: string | null;
  status: string;
  park: { name: string; shortName: string | null } | null;
  partner: { name: string } | null;
  daysUntilEnd: number;
  daysUntilNotice: number | null;
}

type UrgencyLevel = "critical" | "warning" | "notice";

interface GroupedContracts {
  critical: ExpiringContract[]; // 0-30 Tage
  warning: ExpiringContract[]; // 31-60 Tage
  notice: ExpiringContract[]; // 61-90 Tage
}

const typeConfig: Record<string, { label: string }> = {
  LEASE: { label: "Pacht" },
  SERVICE: { label: "Service" },
  INSURANCE: { label: "Versicherung" },
  GRID_CONNECTION: { label: "Netzanschluss" },
  MARKETING: { label: "Vermarktung" },
  OTHER: { label: "Sonstiges" },
};

const urgencyConfig: Record<UrgencyLevel, { label: string; color: string; bgColor: string; icon: typeof AlertTriangle }> = {
  critical: {
    label: "Kritisch (0-30 Tage)",
    color: "text-red-600",
    bgColor: "bg-red-50 border-red-200",
    icon: AlertTriangle,
  },
  warning: {
    label: "Warnung (31-60 Tage)",
    color: "text-orange-600",
    bgColor: "bg-orange-50 border-orange-200",
    icon: Clock,
  },
  notice: {
    label: "Hinweis (61-90 Tage)",
    color: "text-yellow-600",
    bgColor: "bg-yellow-50 border-yellow-200",
    icon: Clock,
  },
};

export function ExpiringContractsWidget() {
  const [contracts, setContracts] = useState<ExpiringContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchExpiringContracts();
  }, []);

  async function fetchExpiringContracts() {
    try {
      setLoading(true);
      setError(null);

      // Berechne Datum in 90 Tagen
      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setDate(futureDate.getDate() + 90);

      const response = await fetch(
        `/api/contracts?status=ACTIVE&endDateBefore=${futureDate.toISOString()}&limit=50`
      );

      if (!response.ok) {
        throw new Error("Fehler beim Laden");
      }

      const data = await response.json();

      // Transformiere und filtere Vertraege
      const expiring = data.data
        .filter((c: { endDate: string | null }) => c.endDate)
        .map((c: {
          id: string;
          title: string;
          contractNumber: string | null;
          contractType: string;
          endDate: string;
          noticeDeadline: string | null;
          status: string;
          park: { name: string; shortName: string | null } | null;
          partner: { name: string } | null;
        }) => {
          const endDate = new Date(c.endDate);
          const daysUntilEnd = differenceInDays(endDate, today);
          const daysUntilNotice = c.noticeDeadline
            ? differenceInDays(new Date(c.noticeDeadline), today)
            : null;

          return {
            ...c,
            daysUntilEnd,
            daysUntilNotice,
          };
        })
        .filter((c: { daysUntilEnd: number }) => c.daysUntilEnd >= 0 && c.daysUntilEnd <= 90)
        .sort((a: { daysUntilEnd: number }, b: { daysUntilEnd: number }) => a.daysUntilEnd - b.daysUntilEnd);

      setContracts(expiring);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }

  // Gruppiere nach Dringlichkeit
  const grouped: GroupedContracts = {
    critical: contracts.filter((c) => c.daysUntilEnd <= 30),
    warning: contracts.filter((c) => c.daysUntilEnd > 30 && c.daysUntilEnd <= 60),
    notice: contracts.filter((c) => c.daysUntilEnd > 60 && c.daysUntilEnd <= 90),
  };

  const totalCount = contracts.length;

  function renderContractItem(contract: ExpiringContract, urgency: UrgencyLevel) {
    const config = urgencyConfig[urgency];
    const hasNoticeDeadline =
      contract.daysUntilNotice !== null && contract.daysUntilNotice >= 0;

    return (
      <Link
        key={contract.id}
        href={`/contracts/${contract.id}`}
        className={`block p-3 rounded-lg border transition-colors hover:bg-muted/50 ${config.bgColor}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-medium truncate">{contract.title}</p>
              <Badge variant="outline" className="text-xs shrink-0">
                {typeConfig[contract.contractType]?.label || contract.contractType}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              {contract.park && (
                <span className="truncate">
                  {contract.park.shortName || contract.park.name}
                </span>
              )}
              {contract.park && contract.partner && <span>-</span>}
              {contract.partner && (
                <span className="truncate">{contract.partner.name}</span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className={`font-semibold ${config.color}`}>
              {contract.daysUntilEnd} Tage
            </p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(contract.endDate), "dd.MM.yyyy", { locale: de })}
            </p>
          </div>
        </div>
        {hasNoticeDeadline && contract.daysUntilNotice! <= 30 && (
          <div className="mt-2 text-xs text-orange-700 bg-orange-100 rounded px-2 py-1 inline-flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Kuendigungsfrist in {contract.daysUntilNotice} Tagen
          </div>
        )}
      </Link>
    );
  }

  function renderUrgencyGroup(level: UrgencyLevel, contracts: ExpiringContract[]) {
    if (contracts.length === 0) return null;

    const config = urgencyConfig[level];
    const Icon = config.icon;

    return (
      <div key={level} className="space-y-2">
        <div className={`flex items-center gap-2 ${config.color}`}>
          <Icon className="h-4 w-4" />
          <span className="text-sm font-medium">{config.label}</span>
          <Badge variant="secondary" className="text-xs">
            {contracts.length}
          </Badge>
        </div>
        <div className="space-y-2">
          {contracts.slice(0, 3).map((c) => renderContractItem(c, level))}
          {contracts.length > 3 && (
            <p className="text-sm text-muted-foreground pl-2">
              + {contracts.length - 3} weitere
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Auslaufende Vertraege
          </CardTitle>
          <CardDescription>
            Vertraege die in den naechsten 90 Tagen auslaufen
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchExpiringContracts}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">{error}</p>
            <Button variant="outline" className="mt-4" onClick={fetchExpiringContracts}>
              Erneut versuchen
            </Button>
          </div>
        ) : totalCount === 0 ? (
          <div className="py-8 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
            <p className="text-lg font-medium">Keine auslaufenden Vertraege</p>
            <p className="text-sm text-muted-foreground mt-1">
              In den naechsten 90 Tagen laufen keine Vertraege aus.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className={`rounded-lg p-2 ${grouped.critical.length > 0 ? "bg-red-50" : "bg-muted/50"}`}>
                <p className={`text-2xl font-bold ${grouped.critical.length > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                  {grouped.critical.length}
                </p>
                <p className="text-xs text-muted-foreground">Kritisch</p>
              </div>
              <div className={`rounded-lg p-2 ${grouped.warning.length > 0 ? "bg-orange-50" : "bg-muted/50"}`}>
                <p className={`text-2xl font-bold ${grouped.warning.length > 0 ? "text-orange-600" : "text-muted-foreground"}`}>
                  {grouped.warning.length}
                </p>
                <p className="text-xs text-muted-foreground">Warnung</p>
              </div>
              <div className={`rounded-lg p-2 ${grouped.notice.length > 0 ? "bg-yellow-50" : "bg-muted/50"}`}>
                <p className={`text-2xl font-bold ${grouped.notice.length > 0 ? "text-yellow-600" : "text-muted-foreground"}`}>
                  {grouped.notice.length}
                </p>
                <p className="text-xs text-muted-foreground">Hinweis</p>
              </div>
            </div>

            <Separator />

            {/* Contract Lists by Urgency */}
            <div className="space-y-6 max-h-[400px] overflow-auto pr-2">
              {renderUrgencyGroup("critical", grouped.critical)}
              {renderUrgencyGroup("warning", grouped.warning)}
              {renderUrgencyGroup("notice", grouped.notice)}
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="border-t pt-4">
        <Button variant="outline" className="w-full" asChild>
          <Link href="/contracts?status=ACTIVE">
            Alle Vertraege anzeigen
            <ChevronRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
