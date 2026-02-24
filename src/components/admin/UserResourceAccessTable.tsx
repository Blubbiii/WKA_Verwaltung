"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
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
import { Trash2, Plus, Shield, Clock, Building, Folder } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ResourceAccessDialog } from "./ResourceAccessDialog";

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
}

interface UserResourceAccessTableProps {
  userId: string;
  userName?: string;
  readOnly?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const RESOURCE_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  PARK: { label: "Windpark", icon: <Building className="h-4 w-4" />, color: "bg-green-100 text-green-800" },
  FUND: { label: "Gesellschaft", icon: <Folder className="h-4 w-4" />, color: "bg-blue-100 text-blue-800" },
  TURBINE: { label: "Turbine", icon: <Building className="h-4 w-4" />, color: "bg-cyan-100 text-cyan-800" },
  DOCUMENT: { label: "Dokument", icon: <Folder className="h-4 w-4" />, color: "bg-yellow-100 text-yellow-800" },
  CONTRACT: { label: "Vertrag", icon: <Folder className="h-4 w-4" />, color: "bg-orange-100 text-orange-800" },
  LEASE: { label: "Pachtvertrag", icon: <Folder className="h-4 w-4" />, color: "bg-amber-100 text-amber-800" },
  INVOICE: { label: "Rechnung", icon: <Folder className="h-4 w-4" />, color: "bg-pink-100 text-pink-800" },
  SHAREHOLDER: { label: "Gesellschafter", icon: <Building className="h-4 w-4" />, color: "bg-purple-100 text-purple-800" },
};

const ACCESS_LEVEL_CONFIG: Record<string, { label: string; color: string }> = {
  READ: { label: "Lesen", color: "bg-blue-100 text-blue-800" },
  WRITE: { label: "Schreiben", color: "bg-green-100 text-green-800" },
  ADMIN: { label: "Admin", color: "bg-purple-100 text-purple-800" },
};

// ============================================================================
// COMPONENT
// ============================================================================

export function UserResourceAccessTable({
  userId,
  userName,
  readOnly = false,
}: UserResourceAccessTableProps) {
  const [accessList, setAccessList] = useState<ResourceAccessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ResourceAccessEntry | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchAccessList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/resource-access?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setAccessList(data.data || []);
      }
    } catch {
      toast({
        title: "Fehler",
        description: "Zugriffsrechte konnten nicht geladen werden",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchAccessList();
  }, [fetchAccessList]);

  // ============================================================================
  // HANDLERS
  // ============================================================================

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
        throw new Error(data.error || "Fehler beim Löschen");
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

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const getResourceTypeBadge = (type: string) => {
    const config = RESOURCE_TYPE_CONFIG[type];
    if (!config) {
      return <Badge variant="outline">{type}</Badge>;
    }
    return (
      <Badge className={config.color}>
        <span className="flex items-center gap-1">
          {config.icon}
          {config.label}
        </span>
      </Badge>
    );
  };

  const getAccessLevelBadge = (level: string) => {
    const config = ACCESS_LEVEL_CONFIG[level];
    return (
      <Badge className={config?.color ?? "bg-gray-100 text-gray-800"}>
        {config?.label ?? level}
      </Badge>
    );
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-medium">Ressourcen-Zugriff</h3>
          <Badge variant="outline">{accessList.length}</Badge>
        </div>
        {!readOnly && (
          <Button onClick={() => setDialogOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Zugriff hinzufügen
          </Button>
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground">
        Direkte Zugriffsrechte auf einzelne Ressourcen, unabhängig von Rollen.
        {userName && ` Aktueller Benutzer: ${userName}`}
      </p>

      {/* Table */}
      {accessList.length === 0 ? (
        <div className="border rounded-lg p-8 text-center">
          <Shield className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">
            Keine direkten Zugriffsrechte vorhanden
          </p>
          {!readOnly && (
            <Button
              onClick={() => setDialogOpen(true)}
              variant="outline"
              className="mt-4"
            >
              <Plus className="h-4 w-4 mr-2" />
              Ersten Zugriff hinzufügen
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ressourcen-Typ</TableHead>
                <TableHead>Ressource</TableHead>
                <TableHead>Zugriffslevel</TableHead>
                <TableHead>Ablauf</TableHead>
                <TableHead>Notiz</TableHead>
                {!readOnly && <TableHead className="w-[50px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {accessList.map((entry) => {
                const expired = isExpired(entry.expiresAt);
                return (
                  <TableRow
                    key={entry.id}
                    className={expired ? "opacity-50 bg-muted/50" : ""}
                  >
                    <TableCell>{getResourceTypeBadge(entry.resourceType)}</TableCell>
                    <TableCell className="font-medium">
                      {entry.resourceName || entry.resourceId.slice(0, 8) + "..."}
                    </TableCell>
                    <TableCell>{getAccessLevelBadge(entry.accessLevel)}</TableCell>
                    <TableCell>
                      {entry.expiresAt ? (
                        <div className={`flex items-center gap-1 text-sm ${expired ? "text-destructive" : "text-muted-foreground"}`}>
                          <Clock className="h-3 w-3" />
                          {new Date(entry.expiresAt).toLocaleDateString("de-DE")}
                          {expired && <span className="text-xs">(abgelaufen)</span>}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Unbegrenzt</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {entry.notes ? (
                        <span className="text-sm text-muted-foreground truncate max-w-[200px] block" title={entry.notes}>
                          {entry.notes}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    {!readOnly && (
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
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Grant Dialog */}
      <ResourceAccessDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        userId={userId}
        mode="grant"
        onSuccess={fetchAccessList}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zugriff entziehen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie den Zugriff auf &quot;{deleteTarget?.resourceName}&quot; wirklich
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
    </div>
  );
}
