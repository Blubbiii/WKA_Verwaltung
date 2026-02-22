"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { formatCurrency } from "@/lib/format";
import { Building2, TrendingUp, Percent } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ENTITY_STATUS, getStatusBadge } from "@/lib/status-config";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Participation {
  id: string;
  shareholderNumber: string | null;
  capitalContribution: number;
  sharePercentage: number;
  joinDate: string | null;
  status: string;
  fund: {
    id: string;
    name: string;
    legalForm: string | null;
    status: string;
    totalCapital: number | null;
    managingDirector: string | null;
    parks: { id: string; name: string; shortName: string | null }[];
  };
}

interface Summary {
  totalParticipations: number;
  totalInvestment: number;
  totalShares: number;
}

export default function ParticipationsPage() {
  const [participations, setParticipations] = useState<Participation[]>([]);
  const [summary, setSummary] = useState<Summary>({
    totalParticipations: 0,
    totalInvestment: 0,
    totalShares: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch("/api/portal/my-participations");
        if (response.ok) {
          const data = await response.json();
          setParticipations(data.data || []);
          setSummary(data.summary || {});
        }
      } catch {
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Meine Beteiligungen</h1>
        <p className="text-muted-foreground">
          Übersicht über alle Ihre Gesellschaftsbeteiligungen
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Beteiligungen</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalParticipations}</div>
            <p className="text-xs text-muted-foreground">Aktive Gesellschaften</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamtinvestition</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary.totalInvestment)}
            </div>
            <p className="text-xs text-muted-foreground">Kapitaleinlage</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamtanteil</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary.totalShares.toFixed(2)}%
            </div>
            <p className="text-xs text-muted-foreground">Durchschnittlich</p>
          </CardContent>
        </Card>
      </div>

      {/* Participations Table */}
      <Card>
        <CardHeader>
          <CardTitle>Beteiligungsübersicht</CardTitle>
          <CardDescription>
            Details zu allen Ihren Gesellschaftsbeteiligungen
          </CardDescription>
        </CardHeader>
        <CardContent>
          {participations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Sie haben noch keine Beteiligungen.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gesellschaft</TableHead>
                    <TableHead>Gesellschafter-Nr.</TableHead>
                    <TableHead>Beitritt</TableHead>
                    <TableHead className="text-right">Einlage</TableHead>
                    <TableHead className="text-right">Anteil</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {participations.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{p.fund.name}</p>
                          {p.fund.legalForm && (
                            <p className="text-sm text-muted-foreground">
                              {p.fund.legalForm}
                            </p>
                          )}
                          {p.fund.parks.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {p.fund.parks.map((park) => park.shortName || park.name).join(", ")}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">
                        {p.shareholderNumber || "-"}
                      </TableCell>
                      <TableCell>
                        {p.joinDate
                          ? format(new Date(p.joinDate), "dd.MM.yyyy", { locale: de })
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(p.capitalContribution)}
                      </TableCell>
                      <TableCell className="text-right">
                        {p.sharePercentage.toFixed(2)}%
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={getStatusBadge(ENTITY_STATUS, p.status).className}
                        >
                          {getStatusBadge(ENTITY_STATUS, p.status).label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fund Details Cards */}
      {participations.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {participations.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle className="text-lg">{p.fund.name}</CardTitle>
                <CardDescription>
                  {p.fund.legalForm || "Keine Rechtsform angegeben"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Ihre Einlage</p>
                    <p className="font-medium">
                      {formatCurrency(p.capitalContribution)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Ihr Anteil</p>
                    <p className="font-medium">{p.sharePercentage.toFixed(2)}%</p>
                  </div>
                  {p.fund.totalCapital && (
                    <div>
                      <p className="text-muted-foreground">Stammkapital</p>
                      <p className="font-medium">
                        {formatCurrency(p.fund.totalCapital)}
                      </p>
                    </div>
                  )}
                  {p.fund.managingDirector && (
                    <div>
                      <p className="text-muted-foreground">Geschäftsführer</p>
                      <p className="font-medium">{p.fund.managingDirector}</p>
                    </div>
                  )}
                </div>
                {p.fund.parks.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">
                      Zugehörige Windparks
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {p.fund.parks.map((park) => (
                        <Badge key={park.id} variant="outline">
                          {park.shortName || park.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
