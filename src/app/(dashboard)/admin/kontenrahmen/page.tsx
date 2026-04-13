"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Search } from "lucide-react";
import { useTranslations } from "next-intl";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AccountCategory = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
type TaxBehavior = "TAXABLE_19" | "TAXABLE_7" | "EXEMPT" | "INPUT_TAX" | "OUTPUT_TAX" | "NONE";

interface LedgerAccount {
  id: string;
  accountNumber: string;
  name: string;
  category: AccountCategory;
  taxBehavior: TaxBehavior;
  isActive: boolean;
  isSystem: boolean;
  parentNumber: string | null;
  notes: string | null;
}

interface FormData {
  accountNumber: string;
  name: string;
  category: AccountCategory;
  taxBehavior: TaxBehavior;
  parentNumber: string;
  notes: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<AccountCategory, string> = {
  ASSET: "Aktiva",
  LIABILITY: "Passiva",
  EQUITY: "Eigenkapital",
  REVENUE: "Ertraege",
  EXPENSE: "Aufwendungen",
};

const CATEGORY_COLORS: Record<AccountCategory, string> = {
  ASSET: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  LIABILITY: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  EQUITY: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  REVENUE: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  EXPENSE: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

const TAX_LABELS: Record<TaxBehavior, string> = {
  TAXABLE_19: "USt 19%",
  TAXABLE_7: "USt 7%",
  EXEMPT: "Steuerfrei",
  INPUT_TAX: "Vorsteuer",
  OUTPUT_TAX: "Umsatzsteuer",
  NONE: "Keine",
};

const EMPTY_FORM: FormData = {
  accountNumber: "",
  name: "",
  category: "EXPENSE",
  taxBehavior: "NONE",
  parentNumber: "",
  notes: "",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function KontenrahmenPage() {
  const t = useTranslations("admin.kontenrahmen");
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchAccounts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterCategory !== "ALL") params.set("category", filterCategory);
      const res = await fetch(`/api/buchhaltung/accounts?${params}`);
      if (!res.ok) throw new Error("Fehler beim Laden");
      const json = await res.json();
      setAccounts(json.data || []);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [search, filterCategory, t]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(acc: LedgerAccount) {
    setEditId(acc.id);
    setForm({
      accountNumber: acc.accountNumber,
      name: acc.name,
      category: acc.category,
      taxBehavior: acc.taxBehavior,
      parentNumber: acc.parentNumber || "",
      notes: acc.notes || "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const url = editId
        ? `/api/buchhaltung/accounts/${editId}`
        : "/api/buchhaltung/accounts";
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          parentNumber: form.parentNumber || null,
          notes: form.notes || null,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Fehler beim Speichern");
      }

      toast.success(editId ? t("accountUpdated") : t("accountCreated"));
      setDialogOpen(false);
      fetchAccounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/buchhaltung/accounts/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Fehler");
      }
      toast.success(t("accountDeactivated"));
      fetchAccounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("deleteError"));
    }
  }

  const filtered = accounts;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={t("categoryLabel")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("allCategories")}</SelectItem>
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              {t("newAccount")}
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">{t("colAccountNo")}</TableHead>
                    <TableHead>{t("colName")}</TableHead>
                    <TableHead className="w-[120px]">{t("colCategory")}</TableHead>
                    <TableHead className="w-[120px]">{t("colTax")}</TableHead>
                    <TableHead className="w-[80px]">{t("colStatus")}</TableHead>
                    <TableHead className="w-[100px] text-right">{t("colActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        {t("noAccounts")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((acc) => (
                      <TableRow key={acc.id} className={!acc.isActive ? "opacity-50" : ""}>
                        <TableCell className="font-mono font-semibold">
                          {acc.parentNumber ? "  " : ""}
                          {acc.accountNumber}
                        </TableCell>
                        <TableCell>
                          {acc.name}
                          {acc.isSystem && (
                            <Badge variant="outline" className="ml-2 text-xs">{t("system")}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={CATEGORY_COLORS[acc.category]} variant="secondary">
                            {CATEGORY_LABELS[acc.category]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {TAX_LABELS[acc.taxBehavior]}
                        </TableCell>
                        <TableCell>
                          <Badge variant={acc.isActive ? "default" : "secondary"}>
                            {acc.isActive ? t("active") : t("inactive")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEdit(acc)}
                              disabled={acc.isSystem}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDelete(acc.id)}
                              disabled={acc.isSystem}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="mt-4 text-sm text-muted-foreground">
            {t("accountsTotal", { count: filtered.length })}
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? t("editDialog") : t("newDialog")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("accountNumber")}</Label>
                <Input
                  value={form.accountNumber}
                  onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
                  placeholder={t("accountNumberPlaceholder")}
                  disabled={!!editId}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("parentAccount")}</Label>
                <Input
                  value={form.parentNumber}
                  onChange={(e) => setForm({ ...form, parentNumber: e.target.value })}
                  placeholder={t("parentAccountPlaceholder")}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("accountName")}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t("accountNamePlaceholder")}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("categoryLabel")}</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v as AccountCategory })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("taxBehavior")}</Label>
                <Select
                  value={form.taxBehavior}
                  onValueChange={(v) => setForm({ ...form, taxBehavior: v as TaxBehavior })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TAX_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("notes")}</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder={t("notesPlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSave} disabled={saving || !form.accountNumber || !form.name}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editId ? t("save") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
