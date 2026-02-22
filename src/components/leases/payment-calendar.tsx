"use client";

import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, getDay, addMonths, subMonths } from "date-fns";
import { de } from "date-fns/locale";
import { formatCurrency } from "@/lib/format";
import {
  ChevronLeft,
  ChevronRight,
  Euro,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { cn } from "@/lib/utils";
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

interface PaymentCalendarProps {
  payments: Payment[];
  year: number;
}

const paymentStatusExtras: Record<string, { borderColor: string; icon: React.ElementType }> = {
  pending: { borderColor: "border-yellow-300", icon: Clock },
  paid: { borderColor: "border-green-300", icon: CheckCircle2 },
  overdue: { borderColor: "border-red-300", icon: AlertTriangle },
};

const weekDays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function PaymentCalendar({ payments, year }: PaymentCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date(year, new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Group payments by date
  const paymentsByDate = useMemo(() => {
    const map = new Map<string, Payment[]>();
    for (const payment of payments) {
      const dateKey = format(new Date(payment.dueDate), "yyyy-MM-dd");
      const existing = map.get(dateKey) || [];
      existing.push(payment);
      map.set(dateKey, existing);
    }
    return map;
  }, [payments]);

  // Get calendar days for current month
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

    // Add padding days for week start (Monday = 0)
    const startDay = getDay(monthStart);
    const paddingStart = startDay === 0 ? 6 : startDay - 1; // Convert Sunday=0 to Monday-based

    return {
      days,
      paddingStart,
    };
  }, [currentMonth]);

  // Get payments for selected date
  const selectedDatePayments = useMemo(() => {
    if (!selectedDate) return [];
    const dateKey = format(selectedDate, "yyyy-MM-dd");
    return paymentsByDate.get(dateKey) || [];
  }, [selectedDate, paymentsByDate]);

  // Calculate month summary
  const monthSummary = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);

    const monthPayments = payments.filter((p) => {
      const dueDate = new Date(p.dueDate);
      return dueDate >= monthStart && dueDate <= monthEnd;
    });

    return {
      total: monthPayments.reduce((sum, p) => sum + p.amount, 0),
      count: monthPayments.length,
      paid: monthPayments.filter((p) => p.status === "paid").length,
      pending: monthPayments.filter((p) => p.status === "pending").length,
      overdue: monthPayments.filter((p) => p.status === "overdue").length,
    };
  }, [currentMonth, payments]);

  function handleDayClick(day: Date) {
    const dateKey = format(day, "yyyy-MM-dd");
    const dayPayments = paymentsByDate.get(dateKey);
    if (dayPayments && dayPayments.length > 0) {
      setSelectedDate(day);
      setIsDialogOpen(true);
    }
  }

  function getPaymentIndicators(day: Date) {
    const dateKey = format(day, "yyyy-MM-dd");
    const dayPayments = paymentsByDate.get(dateKey) || [];

    if (dayPayments.length === 0) return null;

    const hasOverdue = dayPayments.some((p) => p.status === "overdue");
    const hasPending = dayPayments.some((p) => p.status === "pending");
    const hasPaid = dayPayments.some((p) => p.status === "paid");

    return { hasOverdue, hasPending, hasPaid, count: dayPayments.length };
  }

  return (
    <div className="space-y-4">
      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <h3 className="text-lg font-semibold">
            {format(currentMonth, "MMMM yyyy", { locale: de })}
          </h3>
          <p className="text-sm text-muted-foreground">
            {monthSummary.count} Zahlungen - {formatCurrency(monthSummary.total)}
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Month Stats */}
      <div className="flex justify-center gap-4 text-sm">
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-full bg-green-500" />
          <span>{monthSummary.paid} bezahlt</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-full bg-yellow-500" />
          <span>{monthSummary.pending} offen</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-full bg-red-500" />
          <span>{monthSummary.overdue} ueberfaellig</span>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="border rounded-lg overflow-hidden">
        {/* Week Header */}
        <div className="grid grid-cols-7 bg-muted">
          {weekDays.map((day) => (
            <div
              key={day}
              className="p-2 text-center text-sm font-medium text-muted-foreground"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7">
          {/* Padding days */}
          {Array.from({ length: calendarDays.paddingStart }).map((_, i) => (
            <div key={`pad-${i}`} className="p-2 min-h-[80px] bg-muted/30" />
          ))}

          {/* Actual days */}
          {calendarDays.days.map((day) => {
            const isToday = isSameDay(day, new Date());
            const indicators = getPaymentIndicators(day);
            const hasPayments = indicators !== null;

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  "p-2 min-h-[80px] border-t border-l transition-colors",
                  hasPayments && "cursor-pointer hover:bg-muted/50",
                  isToday && "bg-blue-50"
                )}
                onClick={() => hasPayments && handleDayClick(day)}
              >
                <div className="flex flex-col h-full">
                  <span
                    className={cn(
                      "text-sm",
                      isToday && "font-bold text-blue-600"
                    )}
                  >
                    {format(day, "d")}
                  </span>

                  {indicators && (
                    <div className="mt-1 space-y-1">
                      {/* Payment dots */}
                      <div className="flex gap-1 flex-wrap">
                        {indicators.hasOverdue && (
                          <div className="h-2 w-2 rounded-full bg-red-500" title="Ueberfaellig" />
                        )}
                        {indicators.hasPending && (
                          <div className="h-2 w-2 rounded-full bg-yellow-500" title="Offen" />
                        )}
                        {indicators.hasPaid && (
                          <div className="h-2 w-2 rounded-full bg-green-500" title="Bezahlt" />
                        )}
                      </div>

                      {/* Payment count */}
                      {indicators.count > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {indicators.count} {indicators.count === 1 ? "Zahlung" : "Zahlungen"}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Day Detail Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Euro className="h-5 w-5" />
              Zahlungen am {selectedDate && format(selectedDate, "dd. MMMM yyyy", { locale: de })}
            </DialogTitle>
            <DialogDescription>
              {selectedDatePayments.length} {selectedDatePayments.length === 1 ? "Zahlung" : "Zahlungen"} faellig
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Verpaechter</TableHead>
                  <TableHead>Vertrag</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedDatePayments.map((payment) => {
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
                          onClick={() => setIsDialogOpen(false)}
                        >
                          {payment.contractInfo}
                        </Link>
                        {payment.parkName && (
                          <span className="text-muted-foreground text-sm ml-2">
                            ({payment.parkName})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(payment.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(statusBadge.className, extras?.borderColor)}
                        >
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {statusBadge.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="mt-4 pt-4 border-t flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Summe:</span>
              <span className="font-bold text-lg">
                {formatCurrency(selectedDatePayments.reduce((sum, p) => sum + p.amount, 0))}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
