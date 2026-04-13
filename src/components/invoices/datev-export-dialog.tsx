"use client";

import { useState, useEffect } from "react";
import { useTenantSettings } from "@/hooks/useTenantSettings";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarIcon, Download, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
import { Calendar } from "@/components/ui/calendar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

interface DatevExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ExportType = "all" | "invoices" | "credit_notes";

// ============================================================================
// COMPONENT
// ============================================================================

export function DatevExportDialog({ open, onOpenChange }: DatevExportDialogProps) {
  const t = useTranslations("invoices.datevExport");
  // Date range state - default to current year
  const currentYear = new Date().getFullYear();
  const [fromDate, setFromDate] = useState<Date | undefined>(
    new Date(currentYear, 0, 1) // Jan 1
  );
  const [toDate, setToDate] = useState<Date | undefined>(
    new Date(currentYear, 11, 31) // Dec 31
  );

  // Export type filter
  const [exportType, setExportType] = useState<ExportType>("all");

  // Load defaults from tenant settings
  const { settings: tenantSettings } = useTenantSettings();

  // Advanced settings - defaults from tenant settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [consultantNumber, setConsultantNumber] = useState("");
  const [clientNumber, setClientNumber] = useState("");
  const [revenueAccount, setRevenueAccount] = useState("8400");
  const [debtorStart, setDebtorStart] = useState("10000");

  // Update defaults when tenant settings load
  useEffect(() => {
    if (tenantSettings) {
      if (tenantSettings.datevRevenueAccount) setRevenueAccount(tenantSettings.datevRevenueAccount);
      if (tenantSettings.datevDebtorStart) setDebtorStart(String(tenantSettings.datevDebtorStart));
    }
  }, [tenantSettings]);

  // Loading state
  const [isExporting, setIsExporting] = useState(false);

  /**
   * Trigger the DATEV export download
   */
  async function handleExport() {
    if (!fromDate || !toDate) {
      toast.error(t("validation.selectRange"));
      return;
    }

    if (fromDate > toDate) {
      toast.error(t("validation.startBeforeEnd"));
      return;
    }

    setIsExporting(true);

    try {
      // Build query parameters
      const params = new URLSearchParams({
        from: format(fromDate, "yyyy-MM-dd"),
        to: format(toDate, "yyyy-MM-dd"),
        type: exportType,
      });

      // Add optional advanced settings
      if (consultantNumber.trim()) {
        params.set("consultantNumber", consultantNumber.trim());
      }
      if (clientNumber.trim()) {
        params.set("clientNumber", clientNumber.trim());
      }
      if (revenueAccount.trim() && revenueAccount !== "8400") {
        params.set("revenueAccount", revenueAccount.trim());
      }
      if (debtorStart.trim() && debtorStart !== "10000") {
        params.set("debtorStart", debtorStart.trim());
      }

      const response = await fetch(`/api/admin/export/datev?${params.toString()}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: "Unbekannter Fehler beim DATEV-Export",
        }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      // Get the filename from Content-Disposition header or generate one
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = "EXTF_Buchungen.csv";
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      // Show success with count
      const exportCount = response.headers.get("X-Export-Count");
      toast.success(
        exportCount
          ? t("toast.successWithCount", { count: exportCount })
          : t("toast.success")
      );

      // Close dialog after successful export
      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("toast.error");
      toast.error(message);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            {/* From Date */}
            <div className="space-y-2">
              <Label htmlFor="datev-from">{t("labelFrom")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="datev-from"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !fromDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {fromDate
                      ? format(fromDate, "dd.MM.yyyy", { locale: de })
                      : t("placeholderStart")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={fromDate}
                    onSelect={setFromDate}
                    defaultMonth={fromDate}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* To Date */}
            <div className="space-y-2">
              <Label htmlFor="datev-to">{t("labelTo")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    id="datev-to"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !toDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {toDate
                      ? format(toDate, "dd.MM.yyyy", { locale: de })
                      : t("placeholderEnd")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={toDate}
                    onSelect={setToDate}
                    defaultMonth={toDate}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Export Type */}
          <div className="space-y-2">
            <Label htmlFor="datev-type">{t("labelType")}</Label>
            <Select
              value={exportType}
              onValueChange={(value) => setExportType(value as ExportType)}
            >
              <SelectTrigger id="datev-type">
                <SelectValue placeholder={t("selectType")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("typeAll")}</SelectItem>
                <SelectItem value="invoices">{t("typeInvoices")}</SelectItem>
                <SelectItem value="credit_notes">{t("typeCreditNotes")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Advanced Settings (collapsible) */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-muted-foreground"
              >
                <Settings2 className="h-4 w-4" />
                {t("advancedSettings")}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="datev-consultant">{t("labelConsultant")}</Label>
                  <Input
                    id="datev-consultant"
                    value={consultantNumber}
                    onChange={(e) => setConsultantNumber(e.target.value)}
                    placeholder="z.B. 12345"
                    maxLength={20}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="datev-client">{t("labelClient")}</Label>
                  <Input
                    id="datev-client"
                    value={clientNumber}
                    onChange={(e) => setClientNumber(e.target.value)}
                    placeholder="z.B. 67890"
                    maxLength={20}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="datev-revenue">{t("labelRevenueAccount")}</Label>
                  <Input
                    id="datev-revenue"
                    value={revenueAccount}
                    onChange={(e) => setRevenueAccount(e.target.value)}
                    placeholder="8400"
                    maxLength={10}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("revenueAccountHint")}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="datev-debtor">{t("labelDebtorStart")}</Label>
                  <Input
                    id="datev-debtor"
                    type="number"
                    value={debtorStart}
                    onChange={(e) => setDebtorStart(e.target.value)}
                    placeholder="10000"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("debtorStartHint")}
                  </p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Info text */}
          <p className="text-xs text-muted-foreground">
            {t("infoText")}
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isExporting}
          >
            {t("cancel")}
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting || !fromDate || !toDate}
          >
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("exporting")}
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                {t("download")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
