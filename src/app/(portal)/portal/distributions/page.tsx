"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/format";
import { Wallet, Clock, CheckCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PORTAL_DISTRIBUTION_STATUS, getStatusBadge } from "@/lib/status-config";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Distribution {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  netAmount: number;
  taxAmount: number;
  grossAmount: number;
  status: string;
  description: string | null;
  fund: {
    id: string;
    name: string;
  } | null;
  shareholderNumber: string | null;
}

interface Summary {
  totalDistributed: number;
  totalPending: number;
  distributionCount: number;
}

export default function DistributionsPage() {
  const t = useTranslations("portal.distributions");
  const locale = useLocale();
  const dateLocale = locale === "en" ? enUS : de;
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [summary, setSummary] = useState<Summary>({
    totalDistributed: 0,
    totalPending: 0,
    distributionCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch("/api/portal/my-distributions");
        if (response.ok) {
          const data = await response.json();
          setDistributions(data.data || []);
          setSummary(data.summary || {});
        }
      } catch {
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("stats.totalReceived")}
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(summary.totalDistributed)}
            </div>
            <p className="text-xs text-muted-foreground">{t("stats.paidOut")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("stats.pending")}
            </CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(summary.totalPending)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("stats.notPaidYet")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t("stats.count")}
            </CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.distributionCount}</div>
            <p className="text-xs text-muted-foreground">{t("stats.credits")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Distributions Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("history.title")}</CardTitle>
          <CardDescription>{t("history.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {distributions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {t("history.empty")}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("table.creditNumber")}</TableHead>
                    <TableHead>{t("table.company")}</TableHead>
                    <TableHead>{t("table.date")}</TableHead>
                    <TableHead className="text-right">{t("table.net")}</TableHead>
                    <TableHead className="text-right">{t("table.tax")}</TableHead>
                    <TableHead className="text-right">
                      {t("table.gross")}
                    </TableHead>
                    <TableHead>{t("table.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {distributions.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono font-medium">
                        {d.invoiceNumber}
                      </TableCell>
                      <TableCell>{d.fund?.name || "-"}</TableCell>
                      <TableCell>
                        {format(new Date(d.invoiceDate), "dd.MM.yyyy", {
                          locale: dateLocale,
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(d.netAmount)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(d.taxAmount)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(d.grossAmount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={getStatusBadge(PORTAL_DISTRIBUTION_STATUS, d.status).className}
                        >
                          {getStatusBadge(PORTAL_DISTRIBUTION_STATUS, d.status).label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Yearly Summary */}
      {distributions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("yearly.title")}</CardTitle>
            <CardDescription>{t("yearly.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(
                distributions.reduce(
                  (acc, d) => {
                    const year = new Date(d.invoiceDate).getFullYear();
                    if (!acc[year]) {
                      acc[year] = { total: 0, count: 0 };
                    }
                    if (d.status === "PAID") {
                      acc[year].total += d.grossAmount;
                      acc[year].count += 1;
                    }
                    return acc;
                  },
                  {} as Record<number, { total: number; count: number }>
                )
              )
                .sort(([a], [b]) => Number(b) - Number(a))
                .map(([year, data]) => (
                  <div
                    key={year}
                    className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium">{year}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("yearly.count", { count: data.count })}
                      </p>
                    </div>
                    <p className="text-lg font-bold text-green-600">
                      {formatCurrency(data.total)}
                    </p>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
