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
import { Mail, Plus, Pencil, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface EmailRoute {
  id: string;
  address: string;
  targetType: string;
  targetId: string;
  description: string | null;
  isActive: boolean;
  autoAction: string;
}

const TARGET_LABELS: Record<string, string> = {
  PARK: "Windpark",
  FUND: "Gesellschaft",
  TENANT: "Mandant",
  INBOX: "Allgemeine Inbox",
};

const ACTION_LABELS: Record<string, string> = {
  INBOX: "Eingangsrechnungen",
  DOCUMENT: "Dokumentenablage",
  IGNORE: "Ignorieren",
};

export default function EmailRoutesPage() {
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
      toast.error("Fehler beim Laden der E-Mail-Routen");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingRoute(null);
    setAddress("");
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
        toast.success(editingRoute ? "Route aktualisiert" : "Route erstellt");
        setDialogOpen(false);
        load();
      } else {
        const err = await res.json();
        toast.error(err.error || "Fehler beim Speichern");
      }
    } catch {
      toast.error("Fehler beim Speichern");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Route wirklich löschen?")) return;
    try {
      const res = await fetch(`/api/admin/email-routes/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Route gelöscht");
        load();
      }
    } catch {
      toast.error("Fehler beim Löschen");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="E-Mail-Routen"
        description={`Eingehende E-Mails an *@${domain} automatisch verarbeiten`}
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Neue Route
          </Button>
        }
      />

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>E-Mail-Adresse</TableHead>
              <TableHead>Zuordnung</TableHead>
              <TableHead>Aktion</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Beschreibung</TableHead>
              <TableHead className="w-20">Aktionen</TableHead>
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
                  <p>Keine E-Mail-Routen konfiguriert</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={openCreate}>
                    Erste Route erstellen
                  </Button>
                </TableCell>
              </TableRow>
            ) : (
              routes.map((route) => (
                <TableRow key={route.id}>
                  <TableCell className="font-mono text-sm">{route.address}@{domain}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{TARGET_LABELS[route.targetType] || route.targetType}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{ACTION_LABELS[route.autoAction] || route.autoAction}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={route.isActive ? "success" : "secondary"}>
                      {route.isActive ? "Aktiv" : "Inaktiv"}
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
            <DialogTitle>{editingRoute ? "Route bearbeiten" : "Neue E-Mail-Route"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>E-Mail-Adresse (Prefix)</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="windpark-nord"
                  className="font-mono"
                />
                <span className="text-muted-foreground text-sm whitespace-nowrap">@{domain}</span>
              </div>
            </div>
            <div>
              <Label>Zuordnung</Label>
              <Select value={targetType} onValueChange={setTargetType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PARK">Windpark</SelectItem>
                  <SelectItem value="FUND">Gesellschaft</SelectItem>
                  <SelectItem value="TENANT">Mandant</SelectItem>
                  <SelectItem value="INBOX">Allgemeine Inbox</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Aktion bei Eingang</Label>
              <Select value={autoAction} onValueChange={setAutoAction}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INBOX">Eingangsrechnungen (mit OCR)</SelectItem>
                  <SelectItem value="DOCUMENT">Dokumentenablage</SelectItem>
                  <SelectItem value="IGNORE">Ignorieren</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Beschreibung (optional)</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Posteingang Windpark Nord"
                className="mt-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>Aktiv</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSave}>{editingRoute ? "Speichern" : "Erstellen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
