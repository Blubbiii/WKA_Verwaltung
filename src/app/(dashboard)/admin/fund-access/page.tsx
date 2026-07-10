"use client";

/**
 * Sprint 3 ABAC: Fund-Zugriffsverwaltung pro User.
 *
 * Admin wählt einen User aus, sieht alle verfügbaren Funds und kann
 * per Checkbox einschränken. Leere Auswahl = User sieht ALLE Funds.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Info, Loader2, Save, Shield, User as UserIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

interface UserLite {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

interface FundLite {
  id: string;
  name: string;
  status: string;
}

interface AccessResponse {
  user: { id: string; email: string };
  allowedFunds: Array<{ id: string; name: string }>;
  allFunds: FundLite[];
  restricted: boolean;
}

function fmtName(u: UserLite): string {
  const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return name || u.email;
}

export default function FundAccessPage() {
  const [users, setUsers] = useState<UserLite[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [access, setAccess] = useState<AccessResponse | null>(null);
  const [selectedFundIds, setSelectedFundIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingAccess, setLoadingAccess] = useState(false);
  const [saving, setSaving] = useState(false);

  // Initial-Load: alle User — mit AbortController um Unmount-Race zu vermeiden.
  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/admin/users", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!ac.signal.aborted && d?.data) setUsers(d.data);
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        toast.error("User konnten nicht geladen werden");
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, []);

  // AbortController um stale Requests bei User-Wechsel zu cancelln.
  const abortRef = useRef<AbortController | null>(null);

  const loadAccess = useCallback(async (userId: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoadingAccess(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/fund-access`, { signal: ac.signal });
      if (!res.ok) throw new Error();
      const json = (await res.json()) as AccessResponse;
      if (!ac.signal.aborted) {
        setAccess(json);
        setSelectedFundIds(new Set(json.allowedFunds.map((f) => f.id)));
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error("Zugriffsdaten konnten nicht geladen werden");
    } finally {
      if (!ac.signal.aborted) setLoadingAccess(false);
    }
  }, []);

  useEffect(() => {
    if (selectedUserId) loadAccess(selectedUserId);
    else {
      setAccess(null);
      setSelectedFundIds(new Set());
    }
    return () => abortRef.current?.abort();
  }, [selectedUserId, loadAccess]);

  const toggleFund = (fundId: string) => {
    setSelectedFundIds((prev) => {
      const next = new Set(prev);
      if (next.has(fundId)) next.delete(fundId);
      else next.add(fundId);
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUserId}/fund-access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fundIds: [...selectedFundIds] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? "Speichern fehlgeschlagen");
      }
      toast.success("Fund-Zugriff gespeichert");
      await loadAccess(selectedUserId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
    }
  };

  const filteredUsers = users.filter((u) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      u.email.toLowerCase().includes(s) ||
      fmtName(u).toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fund-Zugriffsverwaltung"
        description="ABAC: User-spezifische Fund-Whitelist (leer = alle Funds sichtbar)"
      />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Wenn keine Funds zugewiesen sind, kann der User <strong>alle</strong>{" "}
          Funds des Mandanten sehen (Default). Sobald mindestens ein Fund
          ausgewählt ist, wird der User auf die ausgewählten beschränkt.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserIcon className="h-4 w-4" />
            User auswählen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Nach Name oder E-Mail suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {loading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="User wählen..." />
              </SelectTrigger>
              <SelectContent>
                {filteredUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {fmtName(u)} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {selectedUserId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" />
              Fund-Zugriffe
            </CardTitle>
            <CardDescription>
              {access?.restricted ? (
                <span className="text-orange-600">
                  Eingeschränkt auf {access.allowedFunds.length}{" "}
                  {access.allowedFunds.length === 1 ? "Fund" : "Funds"}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Keine Restriktion — sieht alle Funds
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingAccess ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : !access ? (
              <div className="text-muted-foreground text-center py-4">
                Keine Daten
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {access.allFunds.map((fund) => {
                    const checked = selectedFundIds.has(fund.id);
                    return (
                      <label
                        key={fund.id}
                        className="flex items-center gap-3 rounded border p-2 hover:bg-muted/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleFund(fund.id)}
                        />
                        <div className="flex-1">
                          <Label className="cursor-pointer">{fund.name}</Label>
                        </div>
                        <Badge
                          variant={
                            fund.status === "ACTIVE" ? "default" : "outline"
                          }
                          className="text-xs"
                        >
                          {fund.status}
                        </Badge>
                      </label>
                    );
                  })}
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {selectedFundIds.size === 0
                      ? "Keine Auswahl = User sieht alle Funds"
                      : `${selectedFundIds.size} von ${access.allFunds.length} ausgewählt`}
                  </div>
                  <Button onClick={() => void handleSave()} disabled={saving}>
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Speichern
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
