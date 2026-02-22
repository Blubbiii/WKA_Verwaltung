"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Trash2, Plus, Shield, User, Calendar, Clock } from "lucide-react";
import { toast } from "@/hooks/use-toast";

// ============================================================================
// TYPES
// ============================================================================

interface ResourceAccessEntry {
  id: string;
  userId: string;
  resourceType: string;
  resourceId: string;
  accessLevel: string;
  createdAt: string;
  createdBy: string | null;
  expiresAt: string | null;
  notes: string | null;
  resourceName?: string;
  user?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}

interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

interface Resource {
  id: string;
  name: string;
}

interface ResourceAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId?: string; // Optional: Pre-select user
  resourceType?: string; // Optional: Pre-select resource type
  resourceId?: string; // Optional: Pre-select resource
  mode?: "grant" | "manage"; // "grant" = single grant, "manage" = list/manage all
  onSuccess?: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const RESOURCE_TYPES = [
  { value: "PARK", label: "Windpark" },
  { value: "FUND", label: "Gesellschaft" },
  { value: "TURBINE", label: "Turbine" },
  { value: "DOCUMENT", label: "Dokument" },
  { value: "CONTRACT", label: "Vertrag" },
  { value: "LEASE", label: "Pachtvertrag" },
  { value: "INVOICE", label: "Rechnung" },
  { value: "SHAREHOLDER", label: "Gesellschafter" },
];

const ACCESS_LEVELS = [
  { value: "READ", label: "Lesen", description: "Nur ansehen", color: "bg-blue-100 text-blue-800" },
  { value: "WRITE", label: "Schreiben", description: "Ansehen und bearbeiten", color: "bg-green-100 text-green-800" },
  { value: "ADMIN", label: "Admin", description: "Voller Zugriff", color: "bg-purple-100 text-purple-800" },
];

// ============================================================================
// COMPONENT
// ============================================================================

export function ResourceAccessDialog({
  open,
  onOpenChange,
  userId: preSelectedUserId,
  resourceType: preSelectedResourceType,
  resourceId: preSelectedResourceId,
  mode = "grant",
  onSuccess,
}: ResourceAccessDialogProps) {
  // State fuer Formular
  const [selectedUserId, setSelectedUserId] = useState(preSelectedUserId ?? "");
  const [selectedResourceType, setSelectedResourceType] = useState(preSelectedResourceType ?? "");
  const [selectedResourceId, setSelectedResourceId] = useState(preSelectedResourceId ?? "");
  const [selectedAccessLevel, setSelectedAccessLevel] = useState("READ");
  const [notes, setNotes] = useState("");
  const [expiresAt, setExpiresAt] = useState<string>("");

  // State fuer Daten
  const [users, setUsers] = useState<User[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [accessList, setAccessList] = useState<ResourceAccessEntry[]>([]);

  // Loading States
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingResources, setLoadingResources] = useState(false);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Delete Confirmation
  const [deleteTarget, setDeleteTarget] = useState<ResourceAccessEntry | null>(null);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  // Lade Users
  useEffect(() => {
    if (!open) return;

    const fetchUsers = async () => {
      setLoadingUsers(true);
      try {
        const res = await fetch("/api/admin/users");
        if (res.ok) {
          const data = await res.json();
          setUsers(data.data || []);
        }
      } catch {
        // User fetch failed silently
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, [open]);

  // Lade Ressourcen basierend auf Typ
  const fetchResources = useCallback(async (type: string) => {
    if (!type) {
      setResources([]);
      return;
    }

    setLoadingResources(true);
    try {
      let endpoint = "";
      switch (type) {
        case "PARK":
          endpoint = "/api/parks";
          break;
        case "FUND":
          endpoint = "/api/funds";
          break;
        case "TURBINE":
          endpoint = "/api/turbines";
          break;
        case "DOCUMENT":
          endpoint = "/api/documents";
          break;
        case "CONTRACT":
          endpoint = "/api/contracts";
          break;
        case "LEASE":
          endpoint = "/api/leases";
          break;
        case "INVOICE":
          endpoint = "/api/invoices";
          break;
        case "SHAREHOLDER":
          endpoint = "/api/shareholders";
          break;
        default:
          setResources([]);
          return;
      }

      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        const items = data.data || data || [];

        // Mappe auf einheitliches Format
        const mapped: Resource[] = items.map((item: Record<string, unknown>) => ({
          id: item.id as string,
          name:
            (item.name as string) ||
            (item.title as string) ||
            (item.designation as string) ||
            (item.invoiceNumber as string) ||
            `${(item.firstName as string) || ""} ${(item.lastName as string) || ""}`.trim() ||
            `ID: ${(item.id as string).slice(0, 8)}...`,
        }));

        setResources(mapped);
      }
    } catch {
      // Resource fetch failed silently
    } finally {
      setLoadingResources(false);
    }
  }, []);

  useEffect(() => {
    if (selectedResourceType) {
      fetchResources(selectedResourceType);
    }
  }, [selectedResourceType, fetchResources]);

  // Lade bestehende Zugriffe (fuer manage mode)
  const fetchAccessList = useCallback(async () => {
    if (mode !== "manage") return;

    setLoadingAccess(true);
    try {
      const params = new URLSearchParams();
      if (preSelectedUserId) params.set("userId", preSelectedUserId);
      if (preSelectedResourceType) params.set("resourceType", preSelectedResourceType);
      if (preSelectedResourceId) params.set("resourceId", preSelectedResourceId);

      const res = await fetch(`/api/admin/resource-access?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAccessList(data.data || []);
      }
    } catch {
      // Access list fetch failed silently
    } finally {
      setLoadingAccess(false);
    }
  }, [mode, preSelectedUserId, preSelectedResourceType, preSelectedResourceId]);

  useEffect(() => {
    if (open && mode === "manage") {
      fetchAccessList();
    }
  }, [open, mode, fetchAccessList]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

  const handleSubmit = async () => {
    if (!selectedUserId || !selectedResourceType || !selectedResourceId) {
      toast({
        title: "Fehler",
        description: "Bitte alle Pflichtfelder ausfuellen",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/resource-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          resourceType: selectedResourceType,
          resourceId: selectedResourceId,
          accessLevel: selectedAccessLevel,
          notes: notes || null,
          expiresAt: expiresAt || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Fehler beim Speichern");
      }

      toast({
        title: "Erfolg",
        description: "Zugriff erfolgreich gewaehrt",
      });

      // Reset Form
      if (!preSelectedUserId) setSelectedUserId("");
      if (!preSelectedResourceType) setSelectedResourceType("");
      if (!preSelectedResourceId) setSelectedResourceId("");
      setSelectedAccessLevel("READ");
      setNotes("");
      setExpiresAt("");

      // Refresh Liste im manage mode
      if (mode === "manage") {
        fetchAccessList();
      }

      onSuccess?.();

      if (mode === "grant") {
        onOpenChange(false);
      }
    } catch (error) {
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (entry: ResourceAccessEntry) => {
    try {
      const res = await fetch("/api/admin/resource-access", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: entry.userId,
          resourceType: entry.resourceType,
          resourceId: entry.resourceId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Fehler beim Loeschen");
      }

      toast({
        title: "Erfolg",
        description: "Zugriff erfolgreich entzogen",
      });

      fetchAccessList();
      setDeleteTarget(null);
    } catch (error) {
      toast({
        title: "Fehler",
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
        variant: "destructive",
      });
    }
  };

  const getUserDisplayName = (user: User) => {
    if (user.firstName || user.lastName) {
      return `${user.firstName || ""} ${user.lastName || ""}`.trim();
    }
    return user.email;
  };

  const getAccessLevelBadge = (level: string) => {
    const config = ACCESS_LEVELS.find((l) => l.value === level);
    return (
      <Badge className={config?.color ?? "bg-gray-100 text-gray-800"}>
        {config?.label ?? level}
      </Badge>
    );
  };

  const getResourceTypeLabel = (type: string) => {
    return RESOURCE_TYPES.find((t) => t.value === type)?.label ?? type;
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {mode === "manage" ? "Ressourcen-Zugriff verwalten" : "Ressourcen-Zugriff gewaehren"}
            </DialogTitle>
            <DialogDescription>
              {mode === "manage"
                ? "Verwalten Sie direkte Zugriffsrechte auf einzelne Ressourcen."
                : "Gewaehren Sie einem Benutzer direkten Zugriff auf eine Ressource."}
            </DialogDescription>
          </DialogHeader>

          {/* Grant Form */}
          <div className="space-y-4 py-4">
            {/* User Selection */}
            {!preSelectedUserId && (
              <div className="space-y-2">
                <Label htmlFor="user">Benutzer *</Label>
                {loadingUsers ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger id="user">
                      <SelectValue placeholder="Benutzer auswaehlen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span>{getUserDisplayName(user)}</span>
                            <span className="text-muted-foreground text-xs">
                              ({user.email})
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Resource Type Selection */}
            {!preSelectedResourceType && (
              <div className="space-y-2">
                <Label htmlFor="resourceType">Ressourcen-Typ *</Label>
                <Select value={selectedResourceType} onValueChange={setSelectedResourceType}>
                  <SelectTrigger id="resourceType">
                    <SelectValue placeholder="Typ auswaehlen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {RESOURCE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Resource Selection */}
            {!preSelectedResourceId && selectedResourceType && (
              <div className="space-y-2">
                <Label htmlFor="resource">Ressource *</Label>
                {loadingResources ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select value={selectedResourceId} onValueChange={setSelectedResourceId}>
                    <SelectTrigger id="resource">
                      <SelectValue placeholder="Ressource auswaehlen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {resources.map((resource) => (
                        <SelectItem key={resource.id} value={resource.id}>
                          {resource.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Access Level Selection */}
            <div className="space-y-2">
              <Label htmlFor="accessLevel">Zugriffslevel *</Label>
              <Select value={selectedAccessLevel} onValueChange={setSelectedAccessLevel}>
                <SelectTrigger id="accessLevel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCESS_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      <div className="flex flex-col">
                        <span>{level.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {level.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Expiration Date */}
            <div className="space-y-2">
              <Label htmlFor="expiresAt" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Ablaufdatum (optional)
              </Label>
              <input
                type="datetime-local"
                id="expiresAt"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="text-xs text-muted-foreground">
                Leer lassen fuer unbegrenzten Zugriff
              </p>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notiz (optional)</Label>
              <Textarea
                id="notes"
                placeholder="Grund fuer Zugriff..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
              disabled={
                submitting ||
                !selectedUserId ||
                !selectedResourceType ||
                !selectedResourceId
              }
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              {submitting ? "Wird gespeichert..." : "Zugriff gewaehren"}
            </Button>
          </div>

          {/* Access List (manage mode) */}
          {mode === "manage" && (
            <div className="border-t pt-4">
              <h3 className="font-medium mb-3">Bestehende Zugriffsrechte</h3>
              {loadingAccess ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : accessList.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-4">
                  Keine Zugriffsrechte vorhanden
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {!preSelectedUserId && <TableHead>Benutzer</TableHead>}
                      {!preSelectedResourceType && <TableHead>Typ</TableHead>}
                      <TableHead>Ressource</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Ablauf</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accessList.map((entry) => (
                      <TableRow key={entry.id}>
                        {!preSelectedUserId && (
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">
                                {entry.user
                                  ? getUserDisplayName(entry.user as User)
                                  : entry.userId.slice(0, 8) + "..."}
                              </span>
                            </div>
                          </TableCell>
                        )}
                        {!preSelectedResourceType && (
                          <TableCell className="text-sm">
                            {getResourceTypeLabel(entry.resourceType)}
                          </TableCell>
                        )}
                        <TableCell className="text-sm">
                          {entry.resourceName || entry.resourceId.slice(0, 8) + "..."}
                        </TableCell>
                        <TableCell>{getAccessLevelBadge(entry.accessLevel)}</TableCell>
                        <TableCell className="text-sm">
                          {entry.expiresAt ? (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {new Date(entry.expiresAt).toLocaleDateString("de-DE")}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteTarget(entry)}
                            title="Zugriff entziehen"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Schliessen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zugriff entziehen?</AlertDialogTitle>
            <AlertDialogDescription>
              Moechten Sie den Zugriff auf &quot;{deleteTarget?.resourceName}&quot; wirklich
              entziehen? Diese Aktion kann nicht rueckgaengig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Zugriff entziehen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
