"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Gauge, RefreshCw, Save } from "lucide-react";

interface TenantLimits {
  maxUsers: number;
  maxStorageMb: number;
  maxParks: number;
}

interface TenantUsage {
  currentUsers: number;
  currentParks: number;
  currentStorageMb: number;
}

interface TenantWithLimits {
  id: string;
  name: string;
  slug: string;
  limits: TenantLimits;
  usage: TenantUsage;
}

// Editable state per tenant row
interface EditState {
  maxUsers: string;
  maxStorageMb: string;
  maxParks: string;
}

function UsageCell({
  current,
  max,
  unit,
}: {
  current: number;
  max: number;
  unit?: string;
}) {
  const percentage = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const isWarning = percentage >= 80;
  const isCritical = percentage >= 95;

  return (
    <div className="space-y-1 min-w-[120px]">
      <div className="flex items-center justify-between text-sm">
        <span>
          {current.toLocaleString("de-DE")}
          {unit ? ` ${unit}` : ""}
        </span>
        <span className="text-muted-foreground">
          / {max.toLocaleString("de-DE")}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      <Progress
        value={percentage}
        className={`h-2 ${
          isCritical
            ? "[&>div]:bg-red-500"
            : isWarning
            ? "[&>div]:bg-yellow-500"
            : ""
        }`}
      />
    </div>
  );
}

export function TenantLimitsTab() {
  const [tenants, setTenants] = useState<TenantWithLimits[]>([]);
  const [loading, setLoading] = useState(true);
  const [editStates, setEditStates] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const fetchLimits = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/admin/tenant-limits");
      if (!response.ok) {
        throw new Error("Fehler beim Laden");
      }
      const data = await response.json();
      setTenants(data.data);

      // Initialize edit states
      const states: Record<string, EditState> = {};
      data.data.forEach((tenant: TenantWithLimits) => {
        states[tenant.id] = {
          maxUsers: String(tenant.limits.maxUsers),
          maxStorageMb: String(tenant.limits.maxStorageMb),
          maxParks: String(tenant.limits.maxParks),
        };
      });
      setEditStates(states);
    } catch {
      toast.error("Fehler beim Laden der Mandanten-Limits");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLimits();
  }, [fetchLimits]);

  const handleInputChange = (
    tenantId: string,
    field: keyof EditState,
    value: string
  ) => {
    setEditStates((prev) => ({
      ...prev,
      [tenantId]: {
        ...prev[tenantId],
        [field]: value,
      },
    }));
  };

  const hasChanges = (tenantId: string) => {
    const tenant = tenants.find((t) => t.id === tenantId);
    const editState = editStates[tenantId];
    if (!tenant || !editState) return false;

    return (
      String(tenant.limits.maxUsers) !== editState.maxUsers ||
      String(tenant.limits.maxStorageMb) !== editState.maxStorageMb ||
      String(tenant.limits.maxParks) !== editState.maxParks
    );
  };

  const handleSave = async (tenantId: string) => {
    const editState = editStates[tenantId];
    if (!editState) return;

    const maxUsers = parseInt(editState.maxUsers, 10);
    const maxStorageMb = parseInt(editState.maxStorageMb, 10);
    const maxParks = parseInt(editState.maxParks, 10);

    if (isNaN(maxUsers) || maxUsers < 1) {
      toast.error("Max. Benutzer muss eine positive Zahl sein");
      return;
    }
    if (isNaN(maxStorageMb) || maxStorageMb < 100) {
      toast.error("Max. Speicher muss mindestens 100 MB sein");
      return;
    }
    if (isNaN(maxParks) || maxParks < 1) {
      toast.error("Max. Parks muss eine positive Zahl sein");
      return;
    }

    setSaving(tenantId);

    try {
      const response = await fetch(`/api/admin/tenant-limits/${tenantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxUsers, maxStorageMb, maxParks }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Fehler beim Speichern");
      }

      // Update local state
      setTenants((prev) =>
        prev.map((t) =>
          t.id === tenantId
            ? { ...t, limits: { maxUsers, maxStorageMb, maxParks } }
            : t
        )
      );

      toast.success("Mandanten-Limits gespeichert");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Speichern der Limits"
      );
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5" />
              Mandanten-Limits
            </CardTitle>
            <CardDescription>
              Nutzungsgrenzen pro Mandant verwalten (Benutzer, Speicher, Parks)
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLimits}
            disabled={loading}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Aktualisieren
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : tenants.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Keine aktiven Mandanten gefunden
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Mandant</TableHead>
                  <TableHead className="text-center">
                    Benutzer (aktuell / max)
                  </TableHead>
                  <TableHead className="text-center">
                    Speicher MB (aktuell / max)
                  </TableHead>
                  <TableHead className="text-center">
                    Parks (aktuell / max)
                  </TableHead>
                  <TableHead className="text-center w-[80px]">
                    Aktion
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((tenant) => (
                  <TableRow key={tenant.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{tenant.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {tenant.slug}
                        </Badge>
                      </div>
                    </TableCell>

                    {/* Users */}
                    <TableCell>
                      <div className="space-y-2">
                        <UsageCell
                          current={tenant.usage.currentUsers}
                          max={
                            editStates[tenant.id]
                              ? parseInt(editStates[tenant.id].maxUsers, 10) ||
                                tenant.limits.maxUsers
                              : tenant.limits.maxUsers
                          }
                        />
                        <Input
                          type="number"
                          min={1}
                          className="h-8 w-24 text-center mx-auto"
                          value={editStates[tenant.id]?.maxUsers || ""}
                          onChange={(e) =>
                            handleInputChange(
                              tenant.id,
                              "maxUsers",
                              e.target.value
                            )
                          }
                        />
                      </div>
                    </TableCell>

                    {/* Storage */}
                    <TableCell>
                      <div className="space-y-2">
                        <UsageCell
                          current={tenant.usage.currentStorageMb}
                          max={
                            editStates[tenant.id]
                              ? parseInt(
                                  editStates[tenant.id].maxStorageMb,
                                  10
                                ) || tenant.limits.maxStorageMb
                              : tenant.limits.maxStorageMb
                          }
                          unit="MB"
                        />
                        <Input
                          type="number"
                          min={100}
                          className="h-8 w-24 text-center mx-auto"
                          value={editStates[tenant.id]?.maxStorageMb || ""}
                          onChange={(e) =>
                            handleInputChange(
                              tenant.id,
                              "maxStorageMb",
                              e.target.value
                            )
                          }
                        />
                      </div>
                    </TableCell>

                    {/* Parks */}
                    <TableCell>
                      <div className="space-y-2">
                        <UsageCell
                          current={tenant.usage.currentParks}
                          max={
                            editStates[tenant.id]
                              ? parseInt(editStates[tenant.id].maxParks, 10) ||
                                tenant.limits.maxParks
                              : tenant.limits.maxParks
                          }
                        />
                        <Input
                          type="number"
                          min={1}
                          className="h-8 w-24 text-center mx-auto"
                          value={editStates[tenant.id]?.maxParks || ""}
                          onChange={(e) =>
                            handleInputChange(
                              tenant.id,
                              "maxParks",
                              e.target.value
                            )
                          }
                        />
                      </div>
                    </TableCell>

                    {/* Save Button */}
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        variant={hasChanges(tenant.id) ? "default" : "outline"}
                        disabled={
                          !hasChanges(tenant.id) || saving === tenant.id
                        }
                        onClick={() => handleSave(tenant.id)}
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
