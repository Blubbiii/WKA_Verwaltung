"use client";

import { useState, useCallback, useEffect } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Mail, Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslations } from "next-intl";

interface EmailRoute {
  id: string;
  address: string;
  targetType: string;
  targetId: string;
  description: string | null;
  isActive: boolean;
  autoAction: string;
}

export default function EmailRoutesPage() {
  const t = useTranslations("admin.emailRoutes");
  const [routes, setRoutes] = useState<EmailRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<EmailRoute | null>(null);

  // Form state
  const [address, setAddress] = useState("");
  const [targetType, setTargetType] = useState("INBOX");
  const [targetId, setTargetId] = useState("");
  const [description, setDescription] = useState("");
  const [autoAction, setAutoAction] = useState("INBOX");
  const [isActive, setIsActive] = useState(true);

  const domain = process.env.NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN || "deine-domain.de";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/email-routes");
      if (res.ok) {
        const data = await res.json();
        setRoutes(data.routes || []);
      }
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /** Generate a random, hard-to-guess email prefix like "wp-a7f3x9k2" */
  const generateAddress = (prefix = "wp") => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let random = "";
    for (let i = 0; i < 8; i++) {
      random += chars[Math.floor(Math.random() * chars.length)];
    }
    return `${prefix}-${random}`;
  };

  const openCreate = () => {
    setEditingRoute(null);
    setAddress(generateAddress());
    setTargetType("INBOX");
    setTargetId("");
    setDescription("");
    setAutoAction("INBOX");
    setIsActive(true);
    setDialogOpen(true);
  };

  const openEdit = (route: EmailRoute) => {
    setEditingRoute(route);
    setAddress(route.address);
    setTargetType(route.targetType);
    setTargetId(route.targetId);
    setDescription(route.description || "");
    setAutoAction(route.autoAction);
    setIsActive(route.isActive);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = { address: address.toLowerCase().trim(), targetType, targetId: targetId || "default", description: description || null, autoAction, isActive };

    try {
      const url = editingRoute ? `/api/admin/email-routes/${editingRoute.id}` : "/api/admin/email-routes";
      const method = editingRoute ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

      if (res.ok) {
        toast.success(editingRoute ? t("routeUpdated") : t("routeCreated"));
        setDialogOpen(false);
        load();
      } else {
        const err = await res.json();
        toast.error(err.error || t("saveError"));
      }
    } catch {
      toast.error(t("saveError"));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/admin/email-routes/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("routeDeleted"));
        load();
      }
    } catch {
      toast.error(t("deleteError"));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description", { domain })}
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            {t("newRoute")}
          </Button>
        }
      />

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colAddress")}</TableHead>
              <TableHead>{t("colTarget")}</TableHead>
              <TableHead>{t("colAction")}</TableHead>
              <TableHead>{t("colStatus")}</TableHead>
              <TableHead>{t("colDescription")}</TableHead>
              <TableHead className="w-20">{t("colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-5 w-24" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : routes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>{t("empty")}</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={openCreate}>
                    {t("createFirst")}
                  </Button>
                </TableCell>
              </TableRow>
            ) : (
              routes.map((route) => (
                <TableRow key={route.id}>
                  <TableCell className="font-mono text-sm">{route.address}@{domain}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{t(`target_${route.targetType}`)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{t(`action_${route.autoAction}`)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={route.isActive ? "success" : "secondary"}>
                      {route.isActive ? t("statusActive") : t("statusInactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{route.description || "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(route)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(route.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRoute ? t("dialogEdit") : t("dialogNew")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>{t("fieldAddress")}</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="wp-a7f3x9k2"
                  className="font-mono flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setAddress(generateAddress())}
                  title="Neue Adresse generieren"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <span className="text-muted-foreground text-sm whitespace-nowrap">@{domain}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t("fieldAddressHint")}
              </p>
            </div>
            <div>
              <Label>{t("fieldTarget")}</Label>
              <Select value={targetType} onValueChange={setTargetType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PARK">{t("target_PARK")}</SelectItem>
                  <SelectItem value="FUND">{t("target_FUND")}</SelectItem>
                  <SelectItem value="TENANT">{t("target_TENANT")}</SelectItem>
                  <SelectItem value="INBOX">{t("target_INBOX")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("fieldAction")}</Label>
              <Select value={autoAction} onValueChange={setAutoAction}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INBOX">{t("action_INBOX_full")}</SelectItem>
                  <SelectItem value="DOCUMENT">{t("action_DOCUMENT")}</SelectItem>
                  <SelectItem value="IGNORE">{t("action_IGNORE")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("fieldDescription")}</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("placeholderDescription")}
                className="mt-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>{t("fieldActive")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSave}>{editingRoute ? t("save") : t("create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
