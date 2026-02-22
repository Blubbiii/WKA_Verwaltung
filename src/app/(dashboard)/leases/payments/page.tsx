"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { formatCurrency } from "@/lib/format";
import {
  Search,
  Filter,
  Calendar,
  Euro,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Mail,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaymentCalendar } from "@/components/leases/payment-calendar";
import { toast } from "sonner";
import { PAYMENT_STATUS, getStatusBadge } from "@/lib/status-config";

interface Payment {
  id: string;
  leaseId: string;
  lessorName: string;
  lessorId: string;
  parkId: string | null;
  parkName: string | null;
  dueDate: string;
  amount: number;
  status: "pending" | "paid" | "overdue";
  invoiceId: string | null;
  invoiceNumber: string | null;
  contractInfo: string;
  plots: Array<{
    id: string;
    cadastralDistrict: string;
    plotNumber: string;
  }>;
}

interface Summary {
  total: number;
  paid: number;
  pending: number;
  overdue: number;
  count: {
    total: number;
    paid: number;
    pending: number;
    overdue: number;
  };
}

interface Park {
  id: string;
  name: string;
  shortName: string | null;
}

const paymentStatusExtras: Record<string, { borderColor: string; icon: React.ElementType }> = {
  pending: { borderColor: "border-yellow-300", icon: Clock },
  paid: { borderColor: "border-green-300", icon: CheckCircle2 },
  overdue: { borderColor: "border-red-300", icon: AlertTriangle },
};

export default function LeasePaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [parks, setParks] = useState<Park[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("table");

  // Filters
  const [year, setYear] = useState(new Date().getFullYear());
  const [parkFilter, setParkFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Available years (current year +/- 2)
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        year: year.toString(),
        ...(parkFilter !== "all" && { parkId: parkFilter }),
        ...(statusFilter !== "all" && { status: statusFilter }),
      });

      const response = await fetch(`/api/leases/payments?${params}`);
      if (!response.ok) throw new Error("Fehler beim Laden");

      const data = await response.json();
      setPayments(data.data);
      setSummary(data.summary);
    } catch {
      toast.error("Fehler beim Laden der Zahlungen");
    } finally {
      setLoading(false);
    }
  }, [year, parkFilter, statusFilter]);

  const fetchParks = useCallback(async () => {
    try {
      const response = await fetch("/api/parks?limit=100");
      if (response.ok) {
        const data = await response.json();
        setParks(data.data);
      }
    } catch {
    }
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  useEffect(() => {
    fetchParks();
  }, [fetchParks]);

  // Filter by search
  const filteredPayments = payments.filter((payment) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      payment.lessorName.toLowerCase().includes(searchLower) ||
      payment.contractInfo.toLowerCase().includes(searchLower) ||
      payment.parkName?.toLowerCase().includes(searchLower) ||
      payment.invoiceNumber?.toLowerCase().includes(searchLower)
    );
  });

  async function handleSendReminder(payment: Payment) {
    try {
      toast.info(`Zahlungserinnerung fuer ${payment.lessorName} wird gesendet...`);

      const response = await fetch("/api/leases/payments/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentId: payment.id,
          leaseId: payment.leaseId,
          lessorName: payment.lessorName,
          amount: payment.amount,
          dueDate: payment.dueDate,
          parkName: payment.parkName,
          contractInfo: payment.contractInfo,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "Fehler beim Senden der Zahlungserinnerung");
        return;
      }

      toast.success(data.message || `Zahlungserinnerung an ${payment.lessorName} gesendet`);
    } catch {
      toast.error("Fehler beim Senden der Zahlungserinnerung");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pachtzahlungen</h1>
          <p className="text-muted-foreground">
            Uebersicht aller faelligen und geleisteten Pachtzahlungen
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => fetchPayments()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Aktualisieren
          </Button>
        </div>
      </div>

      {/* Year Navigation */}
      <div className="flex items-center justify-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setYear((y) => y - 1)}
          disabled={year <= years[0]}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <span className="text-2xl font-bold">{year}</span>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setYear((y) => y + 1)}
          disabled={year >= years[years.length - 1]}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamt</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {formatCurrency(summary?.total || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {summary?.count.total || 0} Zahlungen
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bezahlt</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(summary?.paid || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {summary?.count.paid || 0} Zahlungen
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Offen</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold text-yellow-600">
                  {formatCurrency(summary?.pending || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {summary?.count.pending || 0} Zahlungen
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className={summary?.overdue && summary.overdue > 0 ? "border-red-300" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ueberfaellig</CardTitle>
            <AlertTriangle
              className={`h-4 w-4 ${summary?.overdue && summary.overdue > 0 ? "text-red-600" : "text-muted-foreground"}`}
            />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className={`text-2xl font-bold ${summary?.overdue && summary.overdue > 0 ? "text-red-600" : ""}`}>
                  {formatCurrency(summary?.overdue || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {summary?.count.overdue || 0} Zahlungen
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Table / Calendar View */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="table">Tabellenansicht</TabsTrigger>
          <TabsTrigger value="calendar">Kalenderansicht</TabsTrigger>
        </TabsList>

        <TabsContent value="table" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Zahlungsuebersicht</CardTitle>
              <CardDescription>
                Alle Pachtzahlungen fuer {year}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Suchen nach Verpaechter, Flurstueck..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Select value={parkFilter} onValueChange={setParkFilter}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Park" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Parks</SelectItem>
                    {parks.map((park) => (
                      <SelectItem key={park.id} value={park.id}>
                        {park.shortName || park.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Status</SelectItem>
                    <SelectItem value="pending">Offen</SelectItem>
                    <SelectItem value="paid">Bezahlt</SelectItem>
                    <SelectItem value="overdue">Ueberfaellig</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Table */}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Verpaechter</TableHead>
                      <TableHead>Pachtvertrag</TableHead>
                      <TableHead>Park</TableHead>
                      <TableHead>Faelligkeit</TableHead>
                      <TableHead className="text-right">Betrag</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Rechnung</TableHead>
                      <TableHead className="w-[100px]">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 8 }).map((_, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-5 w-20" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : filteredPayments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                          Keine Zahlungen gefunden
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPayments.map((payment) => {
                        const statusBadge = getStatusBadge(PAYMENT_STATUS, payment.status);
                        const extras = paymentStatusExtras[payment.status];
                        const StatusIcon = extras?.icon || Clock;

                        return (
                          <TableRow key={payment.id}>
                            <TableCell className="font-medium">
                              {payment.lessorName}
                            </TableCell>
                            <TableCell>
                              <Link
                                href={`/leases/${payment.leaseId}`}
                                className="text-primary hover:underline"
                              >
                                {payment.contractInfo}
                              </Link>
                            </TableCell>
                            <TableCell>
                              {payment.parkName || "-"}
                            </TableCell>
                            <TableCell>
                              {format(new Date(payment.dueDate), "dd.MM.yyyy", { locale: de })}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(payment.amount)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={`${statusBadge.className} ${extras?.borderColor || ""}`}
                              >
                                <StatusIcon className="mr-1 h-3 w-3" />
                                {statusBadge.label}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {payment.invoiceId ? (
                                <Link
                                  href={`/invoices/${payment.invoiceId}`}
                                  className="text-primary hover:underline flex items-center gap-1"
                                >
                                  <FileText className="h-3 w-3" />
                                  {payment.invoiceNumber}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {payment.status === "overdue" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSendReminder(payment)}
                                  title="Zahlungserinnerung senden"
                                >
                                  <Mail className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                  {!loading && filteredPayments.length > 0 && (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={4} className="font-medium">
                          Summe ({filteredPayments.length} Zahlungen)
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {formatCurrency(filteredPayments.reduce((sum, p) => sum + p.amount, 0))}
                        </TableCell>
                        <TableCell colSpan={3}>
                          <div className="flex gap-2 text-xs">
                            <span className="text-green-600">
                              {filteredPayments.filter((p) => p.status === "paid").length} bezahlt
                            </span>
                            <span className="text-yellow-600">
                              {filteredPayments.filter((p) => p.status === "pending").length} offen
                            </span>
                            <span className="text-red-600">
                              {filteredPayments.filter((p) => p.status === "overdue").length} ueberfaellig
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calendar" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Zahlungskalender</CardTitle>
              <CardDescription>
                Monatsansicht der Pachtzahlungen fuer {year}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PaymentCalendar payments={payments} year={year} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
