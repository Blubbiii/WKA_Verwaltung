"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Handshake, Mail, Phone, Search, Building2 } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { formatCurrency } from "@/lib/format";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

interface GesellschafterRow {
  personId: string;
  name: string;
  email: string | null;
  phone: string | null;
  fundCount: number;
  totalCapitalContribution: number;
  avgOwnershipPercentage: number | null;
  hasActiveExit: boolean;
  funds: Array<{
    fundId: string;
    fundName: string;
    ownershipPercentage: number | null;
    capitalContribution: number | null;
    status: string;
    entryDate: string | null;
    exitDate: string | null;
  }>;
}

export default function GesellschafterPage() {
  const { flags } = useFeatureFlags();
  const [rows, setRows] = useState<GesellschafterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/crm/gesellschafter");
        if (!res.ok) throw new Error();
        setRows(await res.json());
      } catch {
        toast.error("Gesellschafter konnten nicht geladen werden");
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
        r.funds.some((f) => f.fundName.toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const totalCapital = useMemo(
    () => rows.reduce((sum, r) => sum + r.totalCapitalContribution, 0),
    [rows],
  );

  if (!flags.crm) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Handshake className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold">CRM nicht aktiviert</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gesellschafter"
        description={`${rows.length} Personen mit Beteiligung an mindestens einem Fonds · Gesamtkapital ${formatCurrency(totalCapital)}`}
      />

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suchen (Name, E-Mail, Fonds)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            {search ? "Keine Treffer." : "Keine Gesellschafter gefunden."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filtered.map((r) => (
            <Card key={r.personId}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/crm/contacts/${r.personId}`}
                      className="hover:underline"
                    >
                      <CardTitle className="text-base">{r.name}</CardTitle>
                    </Link>
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
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold">
                      {formatCurrency(r.totalCapitalContribution)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.fundCount} Fonds
                      {r.avgOwnershipPercentage !== null
                        ? ` · ⌀ ${r.avgOwnershipPercentage.toFixed(2)}%`
                        : ""}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2">
                  {r.funds.map((f) => (
                    <Link
                      key={f.fundId}
                      href={`/funds/${f.fundId}`}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border text-xs hover:bg-muted/50"
                    >
                      <Building2 className="h-3 w-3" />
                      {f.fundName}
                      {f.ownershipPercentage !== null && (
                        <Badge variant="outline" className="ml-1 text-[10px]">
                          {f.ownershipPercentage}%
                        </Badge>
                      )}
                      {f.exitDate && (
                        <Badge variant="secondary" className="ml-1 text-[10px]">
                          Ausgetreten
                        </Badge>
                      )}
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
