"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { format, isPast } from "date-fns";
import { de } from "date-fns/locale";
import {
  ArrowLeft,
  Vote,
  Clock,
  CheckCircle,
  XCircle,
  MinusCircle,
  Loader2,
  AlertTriangle,
  Users,
  PieChart,
  TrendingUp,
  AlertCircle,
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
import { Progress } from "@/components/ui/progress";
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

// Ergebnis-Typen
interface VoteResultCategory {
  count: number;
  percent: number;
}

interface VoteResultCapitalCategory {
  amount: number;
  percent: number;
}

interface VoteResults {
  byHeadcount: {
    yes: VoteResultCategory;
    no: VoteResultCategory;
    abstain: VoteResultCategory;
    total: number;
  };
  byCapital: {
    yes: VoteResultCapitalCategory;
    no: VoteResultCapitalCategory;
    abstain: VoteResultCapitalCategory;
    totalVoted: number;
    totalEligible: number;
  };
  quorum: {
    required: number | null;
    achieved: number;
    reached: boolean;
  };
  decision: {
    accepted: boolean;
    reason: string;
  };
}

interface VoteDetail {
  id: string;
  title: string;
  description: string | null;
  deadline: string;
  status: string;
  quorumPercent: number | null;
  majorityPercent: number | null;
  requiresCapitalMajority: boolean;
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
  results: VoteResults | null;
}

const decisionLabels: Record<string, string> = {
  YES: "Ja",
  NO: "Nein",
  ABSTAIN: "Enthaltung",
  Ja: "Ja",
  Nein: "Nein",
  Enthaltung: "Enthaltung",
};

const decisionColors: Record<string, string> = {
  YES: "bg-green-100 text-green-800 border-green-300",
  NO: "bg-red-100 text-red-800 border-red-300",
  ABSTAIN: "bg-gray-100 text-gray-800 border-gray-300",
  Ja: "bg-green-100 text-green-800 border-green-300",
  Nein: "bg-red-100 text-red-800 border-red-300",
  Enthaltung: "bg-gray-100 text-gray-800 border-gray-300",
};

// Hilfsfunktion zum Formatieren von Prozenten
function formatPercent(value: number): string {
  return value.toFixed(1).replace(".", ",") + "%";
}

// Ergebnis-Balken Komponente
interface ResultBarProps {
  label: string;
  count: number;
  percent: number;
  color: "green" | "red" | "gray";
  totalLabel?: string;
}

function ResultBar({ label, count, percent, color, totalLabel }: ResultBarProps) {
  const colorClasses = {
    green: "bg-green-500",
    red: "bg-red-500",
    gray: "bg-gray-400",
  };

  const bgColorClasses = {
    green: "bg-green-100",
    red: "bg-red-100",
    gray: "bg-gray-100",
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {count} {totalLabel || "Stimmen"} ({formatPercent(percent)})
        </span>
      </div>
      <div className={`h-6 rounded-full overflow-hidden ${bgColorClasses[color]}`}>
        <div
          className={`h-full ${colorClasses[color]} transition-all duration-500 rounded-full flex items-center justify-end pr-2`}
          style={{ width: `${Math.max(percent, 2)}%` }}
        >
          {percent >= 10 && (
            <span className="text-xs text-white font-medium">
              {formatPercent(percent)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Ergebnis-Anzeige Komponente
interface VoteResultsDisplayProps {
  results: VoteResults;
  requiresCapitalMajority: boolean;
}

function VoteResultsDisplay({ results, requiresCapitalMajority }: VoteResultsDisplayProps) {
  return (
    <div className="space-y-6">
      {/* Beschluss-Status */}
      <Card
        className={
          results.decision.accepted
            ? "border-green-300 bg-green-50/50"
            : "border-red-300 bg-red-50/50"
        }
      >
        <CardContent className="py-6">
          <div className="flex items-center gap-4">
            {results.decision.accepted ? (
              <CheckCircle className="h-10 w-10 text-green-600" />
            ) : (
              <XCircle className="h-10 w-10 text-red-600" />
            )}
            <div>
              <p
                className={`text-xl font-semibold ${
                  results.decision.accepted ? "text-green-800" : "text-red-800"
                }`}
              >
                {results.decision.accepted
                  ? "Beschluss angenommen"
                  : "Beschluss abgelehnt"}
              </p>
              <p
                className={`text-sm ${
                  results.decision.accepted ? "text-green-700" : "text-red-700"
                }`}
              >
                {results.decision.reason}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quorum-Status */}
      {results.quorum.required !== null && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4" />
              Quorum
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>
                  Erforderlich: {formatPercent(results.quorum.required)}
                </span>
                <span>
                  Erreicht: {formatPercent(results.quorum.achieved)}
                </span>
              </div>
              <div className="relative">
                <Progress
                  value={Math.min(
                    (results.quorum.achieved / results.quorum.required) * 100,
                    100
                  )}
                  className="h-4"
                />
                {/* Quorum-Markierung */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-gray-800"
                  style={{
                    left: `${Math.min(
                      (results.quorum.required /
                        Math.max(results.quorum.achieved, results.quorum.required)) *
                        100,
                      100
                    )}%`,
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                {results.quorum.reached ? (
                  <Badge className="bg-green-100 text-green-800 border-green-300">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Quorum erreicht
                  </Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-800 border-red-300">
                    <XCircle className="h-3 w-3 mr-1" />
                    Quorum nicht erreicht
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ergebnisse nach Koepfen */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Ergebnis nach Koepfen
          </CardTitle>
          <CardDescription>
            {results.byHeadcount.total} Gesellschafter haben abgestimmt
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ResultBar
            label="Ja"
            count={results.byHeadcount.yes.count}
            percent={results.byHeadcount.yes.percent}
            color="green"
          />
          <ResultBar
            label="Nein"
            count={results.byHeadcount.no.count}
            percent={results.byHeadcount.no.percent}
            color="red"
          />
          <ResultBar
            label="Enthaltung"
            count={results.byHeadcount.abstain.count}
            percent={results.byHeadcount.abstain.percent}
            color="gray"
          />
        </CardContent>
      </Card>

      {/* Ergebnisse nach Kapital */}
      <Card className={requiresCapitalMajority ? "ring-2 ring-primary/20" : ""}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <PieChart className="h-4 w-4" />
              Ergebnis nach Kapitalanteil
            </CardTitle>
            {requiresCapitalMajority && (
              <Badge variant="outline" className="text-xs">
                <TrendingUp className="h-3 w-3 mr-1" />
                Massgeblich
              </Badge>
            )}
          </div>
          <CardDescription>
            {formatPercent(results.byCapital.totalVoted)} von{" "}
            {formatPercent(results.byCapital.totalEligible)} Kapital haben
            abgestimmt
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ResultBar
            label="Ja"
            count={Number(results.byCapital.yes.amount.toFixed(2))}
            percent={results.byCapital.yes.percent}
            color="green"
            totalLabel="%"
          />
          <ResultBar
            label="Nein"
            count={Number(results.byCapital.no.amount.toFixed(2))}
            percent={results.byCapital.no.percent}
            color="red"
            totalLabel="%"
          />
          <ResultBar
            label="Enthaltung"
            count={Number(results.byCapital.abstain.amount.toFixed(2))}
            percent={results.byCapital.abstain.percent}
            color="gray"
            totalLabel="%"
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function VoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [vote, setVote] = useState<VoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedDecision, setSelectedDecision] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchVote() {
      try {
        const response = await fetch("/api/portal/my-votes");
        if (response.ok) {
          const data = await response.json();
          const foundVote = data.data?.find(
            (v: VoteDetail) => v.id === params.id
          );
          if (foundVote) {
            setVote(foundVote);
          }
        }
      } catch {
      } finally {
        setLoading(false);
      }
    }
    fetchVote();
  }, [params.id]);

  async function handleSubmitVote() {
    if (!selectedDecision || !vote) return;

    try {
      setSubmitting(true);
      setError(null);

      const response = await fetch("/api/portal/my-votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voteId: vote.id,
          decision: selectedDecision,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Fehler beim Abstimmen");
      }

      // Update local state
      setVote({
        ...vote,
        userVote: {
          decision: selectedDecision,
          votedAt: new Date().toISOString(),
        },
        canVote: false,
      });

      setShowConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Abstimmen");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!vote) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/portal/votes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück zu Abstimmungen
          </Link>
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Abstimmung nicht gefunden.
          </CardContent>
        </Card>
      </div>
    );
  }

  const isExpired = isPast(new Date(vote.deadline));
  const isClosed = vote.status === "CLOSED" || isExpired;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/portal/votes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{vote.title}</h1>
          <p className="text-muted-foreground">{vote.fund.name}</p>
        </div>
      </div>

      {/* Vote Details */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Abstimmungsdetails</CardTitle>
              <CardDescription>
                Informationen zur Beschlussfassung
              </CardDescription>
            </div>
            {vote.userVote ? (
              <Badge className={decisionColors[vote.userVote.decision]}>
                Sie haben mit &quot;{decisionLabels[vote.userVote.decision]}&quot; gestimmt
              </Badge>
            ) : isClosed ? (
              <Badge variant="secondary">Abstimmung beendet</Badge>
            ) : (
              <Badge variant="outline" className="text-orange-600 border-orange-600">
                Abstimmung offen
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {vote.description && (
            <div>
              <h4 className="font-medium mb-2">Beschreibung</h4>
              <p className="text-muted-foreground whitespace-pre-wrap">
                {vote.description}
              </p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-4 pt-4 border-t">
            <div>
              <p className="text-sm text-muted-foreground">Frist</p>
              <p className="font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {format(new Date(vote.deadline), "dd.MM.yyyy HH:mm", {
                  locale: de,
                })}
              </p>
            </div>
            {vote.userSharePercentage && (
              <div>
                <p className="text-sm text-muted-foreground">Ihr Stimmrecht</p>
                <p className="font-medium">{vote.userSharePercentage.toFixed(2)}%</p>
              </div>
            )}
            {vote.quorumPercent && (
              <div>
                <p className="text-sm text-muted-foreground">Quorum</p>
                <p className="font-medium">{vote.quorumPercent}%</p>
              </div>
            )}
            {vote.majorityPercent && (
              <div>
                <p className="text-sm text-muted-foreground">Erforderliche Mehrheit</p>
                <p className="font-medium">{vote.majorityPercent}%</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Voting Section */}
      {vote.canVote && !vote.userVote && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Vote className="h-5 w-5" />
              Ihre Stimme abgeben
            </CardTitle>
            <CardDescription>
              Wählen Sie eine der folgenden Optionen
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-800 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <Button
                variant={selectedDecision === "YES" ? "default" : "outline"}
                className={`h-24 flex-col gap-2 ${
                  selectedDecision === "YES" ? "bg-green-600 hover:bg-green-700" : ""
                }`}
                onClick={() => setSelectedDecision("YES")}
              >
                <CheckCircle className="h-8 w-8" />
                <span className="text-lg">Ja</span>
              </Button>

              <Button
                variant={selectedDecision === "NO" ? "default" : "outline"}
                className={`h-24 flex-col gap-2 ${
                  selectedDecision === "NO" ? "bg-red-600 hover:bg-red-700" : ""
                }`}
                onClick={() => setSelectedDecision("NO")}
              >
                <XCircle className="h-8 w-8" />
                <span className="text-lg">Nein</span>
              </Button>

              <Button
                variant={selectedDecision === "ABSTAIN" ? "default" : "outline"}
                className={`h-24 flex-col gap-2 ${
                  selectedDecision === "ABSTAIN" ? "bg-gray-600 hover:bg-gray-700" : ""
                }`}
                onClick={() => setSelectedDecision("ABSTAIN")}
              >
                <MinusCircle className="h-8 w-8" />
                <span className="text-lg">Enthaltung</span>
              </Button>
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                size="lg"
                disabled={!selectedDecision || submitting}
                onClick={() => setShowConfirm(true)}
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Stimme abgeben
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Already Voted */}
      {vote.userVote && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
              <div>
                <p className="font-medium text-green-800">
                  Sie haben bereits abgestimmt
                </p>
                <p className="text-sm text-green-700">
                  Ihre Entscheidung: {decisionLabels[vote.userVote.decision]}
                  {vote.userVote.votedAt && (
                    <span className="ml-2">
                      (am{" "}
                      {format(new Date(vote.userVote.votedAt), "dd.MM.yyyy HH:mm", {
                        locale: de,
                      })}
                      )
                    </span>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Closed without voting */}
      {isClosed && !vote.userVote && (
        <Card className="border-gray-200 bg-gray-50/50">
          <CardContent className="py-6">
            <div className="flex items-center gap-4">
              <Clock className="h-8 w-8 text-gray-600" />
              <div>
                <p className="font-medium text-gray-800">
                  Abstimmung beendet
                </p>
                <p className="text-sm text-gray-700">
                  Sie haben nicht an dieser Abstimmung teilgenommen.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ergebnis-Anzeige für geschlossene Abstimmungen */}
      {isClosed && vote.results && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <PieChart className="h-5 w-5" />
            Abstimmungsergebnis
          </h2>
          <VoteResultsDisplay
            results={vote.results}
            requiresCapitalMajority={vote.requiresCapitalMajority}
          />
        </div>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stimme bestätigen</AlertDialogTitle>
            <AlertDialogDescription>
              Sie sind dabei, mit <strong>{decisionLabels[selectedDecision || ""]}</strong> zu
              stimmen. Diese Entscheidung kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSubmitVote}
              disabled={submitting}
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Bestätigen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
