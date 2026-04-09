"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Sprout, Mail, Phone, AlertTriangle, Search } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate } from "@/lib/format";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

interface VerpaechterRow {
  personId: string;
  name: string;
  email: string | null;
  phone: string | null;
  leaseCount: number;
  activeLeaseCount: number;
  nextExpiry: string | null;
  lastActivityAt: string | null;
  hasContactLink: boolean;
}

export default function VerpaechterPage() {
  const { flags } = useFeatureFlags();
  const [rows, setRows] = useState<VerpaechterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/crm/verpaechter");
        if (!res.ok) throw new Error();
        setRows(await res.json());
      } catch {
        toast.error("Verpächter konnten nicht geladen werden");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.phone?.toLowerCase().includes(q),
    );
  }, [rows, search]);

  if (!flags.crm) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Sprout className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold">CRM nicht aktiviert</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Verpächter"
        description={`${rows.length} Personen, die über einen Pachtvertrag oder als Verpächter-Kontaktrolle verknüpft sind.`}
      />

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suchen (Name, E-Mail, Telefon)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {search ? "Keine Treffer." : "Keine Verpächter gefunden."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((r) => {
            const expiringSoon =
              r.nextExpiry &&
              new Date(r.nextExpiry).getTime() - Date.now() <
                90 * 24 * 60 * 60 * 1000;
            return (
              <Link
                key={r.personId}
                href={`/crm/contacts/${r.personId}`}
                className="block"
              >
                <Card className="hover:bg-muted/30 transition-colors">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm flex items-center gap-2">
                          {r.name}
                          {r.hasContactLink && (
                            <Badge variant="outline" className="text-xs">
                              Rolle
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          {r.email && (
                            <span className="inline-flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {r.email}
                            </span>
                          )}
                          {r.phone && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {r.phone}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0 text-right">
                        <div className="text-sm">
                          <span className="font-semibold">
                            {r.activeLeaseCount}
                          </span>{" "}
                          <span className="text-xs text-muted-foreground">
                            / {r.leaseCount} aktiv
                          </span>
                        </div>
                        {r.nextExpiry && (
                          <Badge
                            variant={expiringSoon ? "destructive" : "outline"}
                            className="text-xs gap-1"
                          >
                            {expiringSoon ? (
                              <AlertTriangle className="h-3 w-3" />
                            ) : null}
                            läuft {formatDate(r.nextExpiry)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
