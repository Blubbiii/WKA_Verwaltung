"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  FolderSync,
  Loader2,
  AlertTriangle,
} from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "next-intl";

interface Fund {
  id: string;
  name: string;
  legalForm: string | null;
}

interface RoutingRule {
  id: string;
  fundId: string | null;
  invoiceType: "INVOICE" | "CREDIT_NOTE";
  targetPath: string;
  targetType: string;
  isActive: boolean;
  description: string | null;
  fund: Fund | null;
  createdAt: string;
  updatedAt: string;
}

interface FormData {
  fundId: string;
  invoiceType: "INVOICE" | "CREDIT_NOTE";
  targetPath: string;
  targetType: string;
  description: string;
  isActive: boolean;
}

const emptyForm: FormData = {
  fundId: "",
  invoiceType: "INVOICE",
  targetPath: "",
  targetType: "onedrive",
  description: "",
  isActive: true,
};

export default function DocumentRoutingPage() {
  const t = useTranslations("admin.documentRouting");
  const { data: session } = useSession();
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RoutingRule | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRule, setDeletingRule] = useState<RoutingRule | null>(null);

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/document-routing");
      if (!res.ok) throw new Error(t("loadError"));
      const json = await res.json();
      setRules(json.data);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchFunds = useCallback(async () => {
    try {
      const res = await fetch("/api/funds?limit=200");
      if (!res.ok) return;
      const json = await res.json();
      setFunds(json.data || []);
    } catch {
      // Funds are optional for the form
    }
  }, []);

  useEffect(() => {
    fetchRules();
    fetchFunds();
  }, [fetchRules, fetchFunds]);

  if ((session?.user?.roleHierarchy ?? 0) < 80) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground gap-2">
        <AlertTriangle className="h-8 w-8" />
        <p>{t("accessDenied")}</p>
      </div>
    );
  }

  const openCreate = () => {
    setEditingRule(null);
    setFormData(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (rule: RoutingRule) => {
    setEditingRule(rule);
    setFormData({
      fundId: rule.fundId || "",
      invoiceType: rule.invoiceType,
      targetPath: rule.targetPath,
      targetType: rule.targetType,
      description: rule.description || "",
      isActive: rule.isActive,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.targetPath.trim()) {
      toast.error(t("targetPathRequired"));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...formData,
        fundId: formData.fundId || null,
        description: formData.description || null,
      };

      const url = editingRule
        ? `/api/admin/document-routing/${editingRule.id}`
        : "/api/admin/document-routing";

      const res = await fetch(url, {
        method: editingRule ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || t("saveError"));
      }

      toast.success(
        editingRule ? t("ruleUpdated") : t("ruleCreated")
      );
      setDialogOpen(false);
      fetchRules();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("saveError")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingRule) return;
    try {
      const res = await fetch(
        `/api/admin/document-routing/${deletingRule.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(t("deleteError"));
      toast.success(t("ruleDeleted"));
      setDeleteDialogOpen(false);
      setDeletingRule(null);
      fetchRules();
    } catch {
      toast.error(t("deleteError"));
    }
  };

  const handleToggleActive = async (rule: RoutingRule) => {
    try {
      const res = await fetch(`/api/admin/document-routing/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });
      if (!res.ok) throw new Error("Fehler");
      fetchRules();
    } catch {
      toast.error(t("updateError"));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-muted-foreground">
              {t("rulesDescription")}
            </p>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              {t("newRule")}
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rules.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FolderSync className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>{t("noRules")}</p>
              <p className="text-sm mt-1">
                {t("createRulesHint")}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colFund")}</TableHead>
                  <TableHead>{t("colDocType")}</TableHead>
                  <TableHead>{t("colTargetPath")}</TableHead>
                  <TableHead>{t("colTarget")}</TableHead>
                  <TableHead>{t("colActive")}</TableHead>
                  <TableHead className="text-right">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => (
                  <TableRow
                    key={rule.id}
                    className={!rule.isActive ? "opacity-50" : ""}
                  >
                    <TableCell>
                      {rule.fund ? (
                        <span className="font-medium">
                          {rule.fund.name}
                          {rule.fund.legalForm && (
                            <span className="text-muted-foreground ml-1">
                              {rule.fund.legalForm}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">
                          {t("allFallback")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          rule.invoiceType === "INVOICE"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {rule.invoiceType === "INVOICE"
                          ? t("invoiceType")
                          : t("creditNoteType")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {rule.targetPath}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {rule.targetType === "onedrive"
                          ? "OneDrive"
                          : rule.targetType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={rule.isActive}
                        onCheckedChange={() => handleToggleActive(rule)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(rule)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setDeletingRule(rule);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingRule
                ? t("editDialog")
                : t("newDialog")}
            </DialogTitle>
            <DialogDescription>
              {t("dialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("labelFund")}</Label>
              <Select
                value={formData.fundId || "__none__"}
                onValueChange={(v) =>
                  setFormData({
                    ...formData,
                    fundId: v === "__none__" ? "" : v,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("selectFund")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {t("allFallbackRule")}
                  </SelectItem>
                  {funds.map((fund) => (
                    <SelectItem key={fund.id} value={fund.id}>
                      {fund.name}
                      {fund.legalForm ? ` ${fund.legalForm}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("labelDocType")}</Label>
              <Select
                value={formData.invoiceType}
                onValueChange={(v) =>
                  setFormData({
                    ...formData,
                    invoiceType: v as "INVOICE" | "CREDIT_NOTE",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INVOICE">{t("invoiceType")}</SelectItem>
                  <SelectItem value="CREDIT_NOTE">
                    {t("creditNoteType")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("labelTargetPath")}</Label>
              <Input
                placeholder={t("targetPathPlaceholder")}
                value={formData.targetPath}
                onChange={(e) =>
                  setFormData({ ...formData, targetPath: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                {t("targetPathHint")}
              </p>
            </div>

            <div className="space-y-2">
              <Label>{t("labelTargetType")}</Label>
              <Select
                value={formData.targetType}
                onValueChange={(v) =>
                  setFormData({ ...formData, targetType: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="onedrive">{t("targetOnedrive")}</SelectItem>
                  <SelectItem value="smb">{t("targetSmb")}</SelectItem>
                  <SelectItem value="dropbox">{t("targetDropbox")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t("labelDescription")}</Label>
              <Input
                placeholder={t("descriptionPlaceholder")}
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isActive}
                onCheckedChange={(v) =>
                  setFormData({ ...formData, isActive: v })
                }
              />
              <Label>{t("ruleActive")}</Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingRule ? t("save") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
