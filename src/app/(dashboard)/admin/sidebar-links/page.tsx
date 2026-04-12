"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Pencil, Trash2, ExternalLink, Globe, Monitor, BarChart3, FileText, Calculator, Zap, Code2, Briefcase, Mail, Calendar, Database, Settings, Link2, Server, Cloud } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

// ── Icon registry ──────────────────────────────────────────────────────────
const ICON_OPTIONS = [
  { value: "Globe", label: "Webseite", Icon: Globe },
  { value: "Monitor", label: "Desktop / SCADA", Icon: Monitor },
  { value: "BarChart3", label: "Diagramme / Analytics", Icon: BarChart3 },
  { value: "Zap", label: "Energie", Icon: Zap },
  { value: "FileText", label: "Dokumente", Icon: FileText },
  { value: "Calculator", label: "Buchhaltung / ERP", Icon: Calculator },
  { value: "Briefcase", label: "Business", Icon: Briefcase },
  { value: "Mail", label: "E-Mail", Icon: Mail },
  { value: "Calendar", label: "Kalender", Icon: Calendar },
  { value: "Database", label: "Datenbank", Icon: Database },
  { value: "Server", label: "Server", Icon: Server },
  { value: "Cloud", label: "Cloud", Icon: Cloud },
  { value: "Code2", label: "Entwicklung", Icon: Code2 },
  { value: "Settings", label: "Einstellungen", Icon: Settings },
  { value: "Link2", label: "Link", Icon: Link2 },
] as const;

const HIERARCHY_OPTIONS = [
  { value: 0, label: "Alle Benutzer" },
  { value: 20, label: "Ab Betrachter" },
  { value: 40, label: "Ab Mitglied" },
  { value: 60, label: "Ab Manager" },
  { value: 80, label: "Ab Administrator" },
  { value: 100, label: "Nur Superadmin" },
];

function getIconComponent(name: string) {
  return ICON_OPTIONS.find((o) => o.value === name)?.Icon ?? Globe;
}

// ── Types ──────────────────────────────────────────────────────────────────
interface SidebarLink {
  id: string;
  label: string;
  url: string;
  icon: string;
  description: string | null;
  openInNewTab: boolean;
  minHierarchy: number;
  sortOrder: number;
  status: "ACTIVE" | "INACTIVE";
}

const EMPTY_FORM = {
  label: "",
  url: "",
  icon: "Globe",
  description: "",
  openInNewTab: true,
  minHierarchy: 0,
  sortOrder: 0,
};

// ── Page ───────────────────────────────────────────────────────────────────
export default function SidebarLinksPage() {
  const t = useTranslations("admin.sidebarLinks");
  const [links, setLinks] = useState<SidebarLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<SidebarLink | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SidebarLink | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = async () => {
    try {
      const res = await fetch("/api/admin/sidebar-links");
      if (res.ok) setLinks(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingLink(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (link: SidebarLink) => {
    setEditingLink(link);
    setForm({
      label: link.label,
      url: link.url,
      icon: link.icon,
      description: link.description ?? "",
      openInNewTab: link.openInNewTab,
      minHierarchy: link.minHierarchy,
      sortOrder: link.sortOrder,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.label.trim()) { toast.error(t("labelRequiredError")); return; }
    if (!form.url.trim()) { toast.error(t("urlRequiredError")); return; }

    // Normalize URL: auto-prepend https:// if no protocol given
    const normalizedUrl = /^https?:\/\//i.test(form.url.trim())
      ? form.url.trim()
      : "https://" + form.url.trim();

    setSaving(true);
    try {
      const endpoint = editingLink
        ? `/api/admin/sidebar-links/${editingLink.id}`
        : "/api/admin/sidebar-links";
      const method = editingLink ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          url: normalizedUrl,
          description: form.description.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // err.error is always a string now (API returns first field error as string)
        throw new Error(typeof err.error === "string" ? err.error : t("saveError"));
      }

      toast.success(editingLink ? t("linkUpdated") : t("linkCreated"));
      setForm((f) => ({ ...f, url: normalizedUrl }));
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/admin/sidebar-links/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("deleteError"));
      toast.success(t("linkDeleted"));
      setDeleteTarget(null);
      load();
    } catch {
      toast.error(t("deleteError"));
    }
  };

  const toggleStatus = async (link: SidebarLink) => {
    const newStatus = link.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const res = await fetch(`/api/admin/sidebar-links/${link.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      setLinks((prev) => prev.map((l) => l.id === link.id ? { ...l, status: newStatus } : l));
    }
  };

  const hierarchyLabel = (h: number) =>
    HIERARCHY_OPTIONS.find((o) => o.value === h)?.label ?? `≥ ${h}`;

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("description")}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          {t("addLink")}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : links.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Link2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>{t("noLinks")}</p>
          <Button variant="outline" className="mt-4" onClick={openCreate}>
            {t("createFirst")}
          </Button>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("colIcon")}</TableHead>
              <TableHead>{t("colLabel")}</TableHead>
              <TableHead>{t("colUrl")}</TableHead>
              <TableHead>{t("colVisibility")}</TableHead>
              <TableHead>{t("colStatus")}</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.map((link) => {
              const IconComp = getIconComponent(link.icon);
              return (
                <TableRow key={link.id}>
                  <TableCell>
                    <IconComp className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                  <TableCell className="font-medium">
                    {link.label}
                    {link.description && (
                      <p className="text-xs text-muted-foreground">{link.description}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 text-sm"
                    >
                      {link.url.length > 40 ? link.url.slice(0, 40) + "…" : link.url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{hierarchyLabel(link.minHierarchy)}</Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={link.status === "ACTIVE"}
                      onCheckedChange={() => toggleStatus(link)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(link)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(link)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingLink ? t("editDialog") : t("newDialog")}</DialogTitle>
            <DialogDescription>
              {editingLink ? t("editDescription") : t("newDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("labelRequired")}</Label>
              <Input
                placeholder={t("labelPlaceholder")}
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("urlRequired")}</Label>
              <Input
                placeholder={t("urlPlaceholder")}
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("iconLabel")}</Label>
                <Select value={form.icon} onValueChange={(v) => setForm((f) => ({ ...f, icon: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map(({ value, label, Icon }) => (
                      <SelectItem key={value} value={value}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("visibilityLabel")}</Label>
                <Select
                  value={String(form.minHierarchy)}
                  onValueChange={(v) => setForm((f) => ({ ...f, minHierarchy: Number(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HIERARCHY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("descriptionLabel")}</Label>
              <Input
                placeholder={t("descriptionPlaceholder")}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("sortOrder")}</Label>
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                />
              </div>
              <div className="flex items-end gap-2 pb-0.5">
                <Switch
                  id="new-tab"
                  checked={form.openInNewTab}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, openInNewTab: v }))}
                />
                <Label htmlFor="new-tab">{t("openInNewTab")}</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("cancel")}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingLink ? t("update") : t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              &bdquo;{deleteTarget?.label}&ldquo; wird unwiderruflich gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
