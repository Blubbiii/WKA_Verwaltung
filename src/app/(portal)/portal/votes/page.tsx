"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { format, isPast } from "date-fns";
import { de } from "date-fns/locale";
import {
  Vote,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface VoteItem {
  id: string;
  title: string;
  description: string | null;
  deadline: string;
  status: string;
  quorumPercent: number | null;
  majorityPercent: number | null;
  fund: {
    id: string;
    name: string;
  };
  totalBallots: number;
  userVote: {
    decision: string;
    votedAt: string | null;
  } | null;
  userSharePercentage: number | null;
  canVote: boolean;
}

interface Summary {
  totalVotes: number;
  activeVotes: number;
  pendingVotes: number;
  closedVotes: number;
}

const decisionLabels: Record<string, string> = {
  YES: "Ja",
  NO: "Nein",
  ABSTAIN: "Enthaltung",
};

const decisionColors: Record<string, string> = {
  YES: "bg-green-100 text-green-800",
  NO: "bg-red-100 text-red-800",
  ABSTAIN: "bg-gray-100 text-gray-800",
};

export default function VotesPage() {
  const [votes, setVotes] = useState<VoteItem[]>([]);
  const [summary, setSummary] = useState<Summary>({
    totalVotes: 0,
    activeVotes: 0,
    pendingVotes: 0,
    closedVotes: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch("/api/portal/my-votes");
        if (response.ok) {
          const data = await response.json();
          setVotes(data.data || []);
          setSummary(data.summary || {});
        }
      } catch {
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const activeVotes = votes.filter(
    (v) => v.status === "ACTIVE" && !isPast(new Date(v.deadline))
  );
  const closedVotes = votes.filter(
    (v) => v.status === "CLOSED" || isPast(new Date(v.deadline))
  );
  const pendingVotes = activeVotes.filter((v) => v.canVote);

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
        <h1 className="text-3xl font-bold tracking-tight">Abstimmungen</h1>
        <p className="text-muted-foreground">
          Gesellschafterbeschlüsse und Abstimmungen
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Offene Abstimmungen</CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {pendingVotes.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Ihre Stimme wird erwartet
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aktiv</CardTitle>
            <Vote className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {activeVotes.length}
            </div>
            <p className="text-xs text-muted-foreground">Laufende Abstimmungen</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Abgeschlossen</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{closedVotes.length}</div>
            <p className="text-xs text-muted-foreground">Beendete Abstimmungen</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Votes Alert */}
      {pendingVotes.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-800">
              <AlertCircle className="h-5 w-5" />
              Abstimmung erforderlich
            </CardTitle>
            <CardDescription>
              Bei den folgenden Abstimmungen wird Ihre Stimme erwartet
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingVotes.map((vote) => (
                <div
                  key={vote.id}
                  className="flex items-center justify-between bg-white p-4 rounded-lg border"
                >
                  <div>
                    <p className="font-medium">{vote.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {vote.fund.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium">Frist</p>
                      <p className="text-sm text-orange-600">
                        {format(new Date(vote.deadline), "dd.MM.yyyy HH:mm", {
                          locale: de,
                        })}
                      </p>
                    </div>
                    <Button asChild>
                      <Link href={`/portal/votes/${vote.id}`}>
                        Abstimmen
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Votes Tabs */}
      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">
            Aktiv ({activeVotes.length})
          </TabsTrigger>
          <TabsTrigger value="closed">
            Abgeschlossen ({closedVotes.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          {activeVotes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Keine aktiven Abstimmungen vorhanden.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {activeVotes.map((vote) => (
                <VoteCard key={vote.id} vote={vote} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="closed" className="mt-4">
          {closedVotes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Keine abgeschlossenen Abstimmungen vorhanden.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {closedVotes.map((vote) => (
                <VoteCard key={vote.id} vote={vote} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function VoteCard({ vote }: { vote: VoteItem }) {
  const isExpired = isPast(new Date(vote.deadline));
  const isClosed = vote.status === "CLOSED" || isExpired;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{vote.title}</CardTitle>
            <CardDescription>{vote.fund.name}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {vote.userVote ? (
              <Badge className={decisionColors[vote.userVote.decision]}>
                {decisionLabels[vote.userVote.decision]}
              </Badge>
            ) : isClosed ? (
              <Badge variant="secondary">Nicht abgestimmt</Badge>
            ) : (
              <Badge variant="outline" className="text-orange-600 border-orange-600">
                Offen
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {vote.description && (
          <p className="text-sm text-muted-foreground mb-4">{vote.description}</p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-muted-foreground">Frist: </span>
              <span className={isClosed ? "text-muted-foreground" : ""}>
                {format(new Date(vote.deadline), "dd.MM.yyyy HH:mm", {
                  locale: de,
                })}
              </span>
            </div>
            {vote.userSharePercentage && (
              <div>
                <span className="text-muted-foreground">Ihr Stimmrecht: </span>
                <span>{vote.userSharePercentage.toFixed(2)}%</span>
              </div>
            )}
            {vote.quorumPercent && (
              <div>
                <span className="text-muted-foreground">Quorum: </span>
                <span>{vote.quorumPercent}%</span>
              </div>
            )}
          </div>

          {vote.canVote && (
            <Button asChild>
              <Link href={`/portal/votes/${vote.id}`}>
                Abstimmen
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
