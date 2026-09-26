"use client";

/**
 * Park access per user (decision E4, 2026-09), next to the fund access page.
 *
 * No park selected = the user sees every park of the tenant. With a
 * selection the park list, the park detail and the dashboard figures show
 * only those parks (lib/auth/park-access).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Info, Loader2, Save, User as UserIcon, Wind } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApiQuery } from "@/hooks/useApiQuery";

interface UserLite {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

interface ParkLite {
  id: string;
  name: string;
  shortName: string | null;
  status: string;
}

interface AccessResponse {
  user: { id: string; email: string };
  allowedParks: ParkLite[];
  allParks: ParkLite[];
  restricted: boolean;
}

function anzeigeName(u: UserLite) {
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email;
}

export default function ParkAccessPage() {
  const t = useTranslations("admin.parkAccess");
  const queryClient = useQueryClient();
  const [nutzerId, setNutzerId] = useState("");
  const [suche, setSuche] = useState("");
  // Local edits of the selection; null = not edited, the server state applies.
  const [auswahl, setAuswahl] = useState<Set<string> | null>(null);

  const nutzer = useApiQuery<{ data: UserLite[] }>("admin-users", "/api/admin/users");
  const zugriff = useQuery({
    queryKey: ["park-access", nutzerId],
    enabled: !!nutzerId,
    queryFn: async (): Promise<AccessResponse> => {
      const res = await fetch(`/api/admin/users/${nutzerId}/park-access`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const gewaehlt = auswahl ?? new Set(zugriff.data?.allowedParks.map((p) => p.id) ?? []);

  const speichern = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/users/${nutzerId}/park-access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parkIds: [...gewaehlt] }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || t("saveError"));
      return json;
    },
    onSuccess: () => {
      toast.success(t("saved"));
      setAuswahl(null);
      queryClient.invalidateQueries({ queryKey: ["park-access", nutzerId] });
    },
    onError: (e) => toast.error(e.message),
  });

  const umschalten = (id: string) => {
    const neu = new Set(gewaehlt);
    if (neu.has(id)) neu.delete(id);
    else neu.add(id);
    setAuswahl(neu);
  };

  const gefiltert = (nutzer.data?.data ?? []).filter((u) => {
    const s = suche.toLowerCase();
    return !s || u.email.toLowerCase().includes(s) || anzeigeName(u).toLowerCase().includes(s);
  });
  const parks = zugriff.data?.allParks ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>{t("hint")}</AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserIcon className="h-4 w-4" />
            {t("chooseUser")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder={t("searchUser")} value={suche} onChange={(e) => setSuche(e.target.value)} />
          {nutzer.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select
              value={nutzerId}
              onValueChange={(v) => {
                setNutzerId(v);
                setAuswahl(null);
              }}
            >
              <SelectTrigger aria-label={t("chooseUser")}>
                <SelectValue placeholder={t("chooseUserPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {gefiltert.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {anzeigeName(u)} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {nutzerId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wind className="h-4 w-4" />
              {t("parks")}
            </CardTitle>
            <CardDescription>
              {zugriff.data?.restricted ? (
                <span className="text-orange-600">
                  {t("restrictedTo", { count: zugriff.data.allowedParks.length })}
                </span>
              ) : (
                t("unrestricted")
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {zugriff.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : (
              <>
                <div className="mb-3 flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAuswahl(new Set(parks.map((p) => p.id)))}>
                    {t("selectAll")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setAuswahl(new Set())}>
                    {t("selectNone")}
                  </Button>
                </div>
                <div className="max-h-96 space-y-2 overflow-y-auto">
                  {parks.map((park) => (
                    <label
                      key={park.id}
                      className="flex cursor-pointer items-center gap-3 rounded border p-2 hover:bg-muted/50"
                    >
                      <Checkbox checked={gewaehlt.has(park.id)} onCheckedChange={() => umschalten(park.id)} />
                      <span className="flex-1 text-sm">
                        {park.name}
                        {park.shortName && <span className="text-muted-foreground"> ({park.shortName})</span>}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {gewaehlt.size === 0
                      ? t("noneSelected")
                      : t("selectedOf", { count: gewaehlt.size, total: parks.length })}
                  </p>
                  <Button onClick={() => speichern.mutate()} disabled={speichern.isPending || auswahl === null}>
                    {speichern.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {t("save")}
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
