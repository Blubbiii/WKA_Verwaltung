"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { formatCurrency } from "@/lib/format";
import {
  Building2,
  Wallet,
  Vote,
  ArrowRight,
  TrendingUp,
  Clock,
  AlertCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Participation {
  id: string;
  shareholderNumber: string | null;
  capitalContribution: number;
  sharePercentage: number;
  fund: {
    id: string;
    name: string;
  };
}

interface Distribution {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  grossAmount: number;
  status: string;
  fund: {
    id: string;
    name: string;
  } | null;
}

interface VoteItem {
  id: string;
  title: string;
  deadline: string;
  fund: {
    id: string;
    name: string;
  };
  canVote: boolean;
}

export default function PortalDashboardPage() {
  const [participations, setParticipations] = useState<Participation[]>([]);
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [votes, setVotes] = useState<VoteItem[]>([]);
  const [summary, setSummary] = useState({
    totalInvestment: 0,
    totalDistributed: 0,
    pendingVotes: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [partRes, distRes, voteRes] = await Promise.all([
          fetch("/api/portal/my-participations"),
          fetch("/api/portal/my-distributions"),
          fetch("/api/portal/my-votes"),
        ]);

        if (partRes.ok) {
          const partData = await partRes.json();
          setParticipations(partData.data || []);
          setSummary((s) => ({
            ...s,
            totalInvestment: partData.summary?.totalInvestment || 0,
          }));
        }

        if (distRes.ok) {
          const distData = await distRes.json();
          setDistributions(distData.data?.slice(0, 5) || []);
          setSummary((s) => ({
            ...s,
            totalDistributed: distData.summary?.totalDistributed || 0,
          }));
        }

        if (voteRes.ok) {
          const voteData = await voteRes.json();
          setVotes(
            voteData.data?.filter((v: VoteItem) => v.canVote).slice(0, 3) || []
          );
          setSummary((s) => ({
            ...s,
            pendingVotes: voteData.summary?.pendingVotes || 0,
          }));
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
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mein Dashboard</h1>
        <p className="text-muted-foreground">
          Übersicht über Ihre Beteiligungen und Aktivitäten
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Beteiligungen</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{participations.length}</div>
            <p className="text-xs text-muted-foreground">
              Gesamtinvestition: {formatCurrency(summary.totalInvestment)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Ausschüttungen
            </CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary.totalDistributed)}
            </div>
            <p className="text-xs text-muted-foreground">
              Gesamt erhalten
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Offene Abstimmungen
            </CardTitle>
            <Vote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.pendingVotes}</div>
            <p className="text-xs text-muted-foreground">
              Ihre Stimme wird erwartet
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Participations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Meine Beteiligungen
            </CardTitle>
            <CardDescription>
              Ihre aktiven Gesellschaftsbeteiligungen
            </CardDescription>
          </CardHeader>
          <CardContent>
            {participations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Keine Beteiligungen vorhanden
              </p>
            ) : (
              <div className="space-y-4">
                {participations.slice(0, 4).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium">{p.fund.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {p.shareholderNumber || "Keine Nr."}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {formatCurrency(p.capitalContribution)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {p.sharePercentage.toFixed(2)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Button variant="ghost" className="w-full mt-4" asChild>
              <Link href="/portal/participations">
                Alle anzeigen
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Recent Distributions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Letzte Ausschüttungen
            </CardTitle>
            <CardDescription>
              Ihre letzten erhaltenen Gutschriften
            </CardDescription>
          </CardHeader>
          <CardContent>
            {distributions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Keine Ausschüttungen vorhanden
              </p>
            ) : (
              <div className="space-y-4">
                {distributions.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium">{d.invoiceNumber}</p>
                      <p className="text-sm text-muted-foreground">
                        {d.fund?.name || "-"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-green-600">
                        {formatCurrency(d.grossAmount)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(d.invoiceDate), "dd.MM.yyyy", {
                          locale: de,
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Button variant="ghost" className="w-full mt-4" asChild>
              <Link href="/portal/distributions">
                Alle anzeigen
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Pending Votes */}
      {votes.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-800">
              <AlertCircle className="h-5 w-5" />
              Offene Abstimmungen
            </CardTitle>
            <CardDescription>
              Bitte stimmen Sie bis zum Ablaufdatum ab
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {votes.map((vote) => (
                <div
                  key={vote.id}
                  className="flex items-center justify-between bg-white p-3 rounded-lg border"
                >
                  <div>
                    <p className="font-medium">{vote.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {vote.fund.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-sm text-orange-600">
                        <Clock className="h-3 w-3" />
                        {format(new Date(vote.deadline), "dd.MM.yyyy", {
                          locale: de,
                        })}
                      </div>
                    </div>
                    <Button size="sm" asChild>
                      <Link href={`/portal/votes/${vote.id}`}>
                        Abstimmen
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="ghost" className="w-full mt-4" asChild>
              <Link href="/portal/votes">
                Alle Abstimmungen
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
