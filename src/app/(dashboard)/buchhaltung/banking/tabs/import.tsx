"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Upload, Loader2, Check, X, HelpCircle } from "lucide-react";

interface BankTx {
  id: string;
  bookingDate: string;
  amount: string;
  currency: string;
  counterpartName: string | null;
  reference: string | null;
  matchStatus: string;
  matchConfidence: number | null;
  matchedInvoice: {
    id: string;
    invoiceNumber: string;
    grossAmount: string;
    recipientName: string;
  } | null;
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  MATCHED: "default",
  SUGGESTED: "outline",
  UNMATCHED: "destructive",
  IGNORED: "secondary",
};

function fmt(n: string | number): string {
  return Number(n).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BankImportContent() {
  const t = useTranslations("buchhaltung.bankingImport");
  const [transactions, setTransactions] = useState<BankTx[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState("ALL");
  const fileRef = useRef<HTMLInputElement>(null);

  const statusLabel = useCallback(
    (status: string): string => {
      switch (status) {
        case "MATCHED": return t("statusMatched");
        case "SUGGESTED": return t("statusSuggested");
        case "UNMATCHED": return t("statusUnmatched");
        case "IGNORED": return t("statusIgnored");
        default: return t("statusUnmatched");
      }
    },
    [t]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "ALL") params.set("status", filter);
      const res = await fetch(`/api/buchhaltung/bank/transactions?${params}`);
      if (!res.ok) throw new Error();
      const json = await res.json();
      setTransactions(json.data || []);
      setTotal(json.total || 0);
    } catch {
      toast.error(t("toastLoadError"));
    } finally {
      setLoading(false);
    }
  }, [filter, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/buchhaltung/bank/import", { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.json()).error);
      const json = await res.json();
      toast.success(t("toastImportSuccess", { imported: json.imported, matched: json.matched, suggested: json.suggested }));
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toastImportError"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleAction(id: string, action: "match" | "ignore" | "unmatch", invoiceId?: string) {
    try {
      const res = await fetch(`/api/buchhaltung/bank/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, invoiceId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success(
        action === "match" ? t("toastMatched") : action === "ignore" ? t("toastIgnored") : t("toastUnmatched")
      );
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toastActionError"));
    }
  }

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 mb-6 items-end">
            <div>
              <input ref={fileRef} type="file" accept=".sta,.mt940,.txt,.xml" className="hidden" onChange={handleUpload} />
              <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {t("importBtn")}
              </Button>
            </div>
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("filterAll")}</SelectItem>
                <SelectItem value="UNMATCHED">{t("filterUnmatched")}</SelectItem>
                <SelectItem value="SUGGESTED">{t("filterSuggested")}</SelectItem>
                <SelectItem value="MATCHED">{t("filterMatched")}</SelectItem>
                <SelectItem value="IGNORED">{t("filterIgnored")}</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">{t("txCount", { count: total })}</span>
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : transactions.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">{t("emptyState")}</div>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">{t("colDate")}</TableHead>
                    <TableHead className="text-right w-[100px]">{t("colAmount")}</TableHead>
                    <TableHead>{t("colCounterpart")}</TableHead>
                    <TableHead>{t("colReference")}</TableHead>
                    <TableHead className="w-[120px]">{t("colStatus")}</TableHead>
                    <TableHead>{t("colMatchedTo")}</TableHead>
                    <TableHead className="w-[120px] text-right">{t("colActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => {
                    const variant = STATUS_VARIANTS[tx.matchStatus] || STATUS_VARIANTS.UNMATCHED;
                    return (
                      <TableRow key={tx.id}>
                        <TableCell className="font-mono text-sm">{formatDate(tx.bookingDate)}</TableCell>
                        <TableCell className={`text-right font-mono text-sm ${Number(tx.amount) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {fmt(tx.amount)} {tx.currency}
                        </TableCell>
                        <TableCell className="text-sm">{tx.counterpartName || "-"}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{tx.reference || "-"}</TableCell>
                        <TableCell><Badge variant={variant}>{statusLabel(tx.matchStatus)}</Badge></TableCell>
                        <TableCell className="text-sm">{tx.matchedInvoice?.invoiceNumber || "-"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {tx.matchStatus === "SUGGESTED" && tx.matchedInvoice && (
                              <Button size="icon" variant="ghost" title={t("actionMatch")}
                                onClick={() => handleAction(tx.id, "match", tx.matchedInvoice?.id)}>
                                <Check className="h-4 w-4 text-green-600" />
                              </Button>
                            )}
                            {tx.matchStatus !== "IGNORED" && tx.matchStatus !== "MATCHED" && (
                              <Button size="icon" variant="ghost" title={t("actionIgnore")}
                                onClick={() => handleAction(tx.id, "ignore")}>
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                            {tx.matchStatus === "MATCHED" && (
                              <Button size="icon" variant="ghost" title={t("actionUnmatch")}
                                onClick={() => handleAction(tx.id, "unmatch")}>
                                <HelpCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
