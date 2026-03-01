"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  ArrowLeft,
  Play,
  Square,
  Pencil,
  Users,
  CheckCircle,
  XCircle,
  Clock,
  BarChart3,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { VOTE_STATUS, getStatusBadge } from "@/lib/status-config";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface VoteDetail {
  id: string;
  title: string;
  description: string | null;
  voteType: string;
  options: string[];
  startDate: string;
  endDate: string;
  quorumPercentage: number | null;
  requiresCapitalMajority: boolean;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  fund: {
    id: string;
    name: string;
    legalForm: string | null;
  };
  createdBy: string | null;
  createdAt: string;
  responses: {
    id: string;
    selectedOption: string;
    votedAt: string;
    shareholder: {
      id: string;
      shareholderNumber: string | null;
      name: string;
      votingRights: number | null;
    };
  }[];
  eligibleShareholders: {
    id: string;
    shareholderNumber: string | null;
    name: string;
    votingRights: number | null;
    hasVoted: boolean;
  }[];
  stats: {
    totalEligible: number;
    totalResponses: number;
    participationRate: string;
    capitalParticipation: string;
    quorumMet: boolean;
    isApproved: boolean | null;
  };
  results: {
    byHead: { option: string; count: number; percentage: string }[];
    byCapital: { option: string; capitalWeight: string; percentage: string }[];
  };
}


export default function VoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [vote, setVote] = useState<VoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    fetchVote();
  }, [params.id]);

  async function fetchVote() {
    try {
      const response = await fetch(`/api/votes/${params.id}`);
      if (!response.ok) throw new Error("Fehler beim Laden");
      const data = await response.json();
      setVote(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(status: string) {
    try {
      const response = await fetch(`/api/votes/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (response.ok) {
        fetchVote();
      }
    } catch {
    }
  }

  async function handleExportPdf() {
    if (!vote || vote.status !== "CLOSED") return;

    setIsExporting(true);
    try {
      const response = await fetch(`/api/votes/${params.id}/export`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Fehler beim Exportieren");
      }

      // PDF als Blob laden
      const blob = await response.blob();

      // Download-Link erstellen
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      // Filename aus Content-Disposition Header extrahieren oder Fallback
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = `Abstimmungsergebnis_${vote.title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) {
          filename = match[1];
        }
      }

      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim PDF-Export");
    } finally {
      setIsExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!vote) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/votes">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück
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

  const config = getStatusBadge(VOTE_STATUS, vote.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/votes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{vote.title}</h1>
              <Badge variant="secondary" className={config.className}>
                {config.label}
              </Badge>
            </div>
            <p className="text-muted-foreground">{vote.fund.name}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {vote.status === "DRAFT" && (
            <>
              <Button variant="outline" asChild>
                <Link href={`/votes/${vote.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Bearbeiten
                </Link>
              </Button>
              <Button onClick={() => updateStatus("ACTIVE")}>
                <Play className="mr-2 h-4 w-4" />
                Starten
              </Button>
            </>
          )}
          {vote.status === "ACTIVE" && (
            <Button variant="destructive" onClick={() => updateStatus("CLOSED")}>
              <Square className="mr-2 h-4 w-4" />
              Beenden
            </Button>
          )}
          {vote.status === "CLOSED" && (
            <Button
              variant="outline"
              onClick={handleExportPdf}
              disabled={isExporting}
            >
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? "Exportiere..." : "PDF Export"}
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-medium">Stimmberechtigte</CardTitle>
              <InfoTooltip text="Anzahl der Gesellschafter, die an dieser Abstimmung teilnehmen dürfen." />
            </div>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vote.stats.totalEligible}</div>
            <p className="text-xs text-muted-foreground">Gesellschafter</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-medium">Abgestimmt</CardTitle>
              <InfoTooltip text="Anzahl der bereits eingegangenen Stimmabgaben." />
            </div>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vote.stats.totalResponses}</div>
            <p className="text-xs text-muted-foreground">
              {vote.stats.participationRate}% Beteiligung
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-medium">Kapital-Beteiligung</CardTitle>
              <InfoTooltip text="Anteil des abgestimmten Kapitals am Gesamtkapital der Gesellschaft." />
            </div>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{vote.stats.capitalParticipation}%</div>
            <p className="text-xs text-muted-foreground">des Stimmrechts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-medium">Quorum</CardTitle>
              <InfoTooltip text="Mindestanteil der Stimmen bzw. des Kapitals, der für die Beschlussfähigkeit erreicht werden muss." />
            </div>
            {vote.stats.quorumMet ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : (
              <XCircle className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {vote.quorumPercentage ? `${vote.quorumPercentage}%` : "Kein"}
            </div>
            <p className="text-xs text-muted-foreground">
              {vote.stats.quorumMet ? "Erreicht" : "Nicht erreicht"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Description */}
      {vote.description && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Beschreibung</CardTitle>
              <InfoTooltip text="Gegenstand und Inhalt der Abstimmung." />
            </div>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{vote.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Results Card (for ACTIVE and CLOSED) */}
      {vote.status !== "DRAFT" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Ergebnis</CardTitle>
              <InfoTooltip text="Aktuelles Abstimmungsergebnis auf Basis der abgegebenen Stimmen." />
            </div>
            <CardDescription>
              {vote.requiresCapitalMajority
                ? "Abstimmung nach Kapitalanteilen"
                : "Abstimmung nach Köpfen"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              {/* By Head */}
              <div>
                <h4 className="font-medium mb-4">Nach Köpfen</h4>
                <div className="space-y-3">
                  {vote.results.byHead.map((result) => (
                    <div key={result.option} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{result.option}</span>
                        <span>
                          {result.count} ({result.percentage}%)
                        </span>
                      </div>
                      <Progress
                        value={parseFloat(result.percentage)}
                        className={`h-2 ${
                          result.option === "Ja"
                            ? "[&>div]:bg-green-500"
                            : result.option === "Nein"
                            ? "[&>div]:bg-red-500"
                            : ""
                        }`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* By Capital */}
              <div>
                <h4 className="font-medium mb-4">Nach Kapitalanteil</h4>
                <div className="space-y-3">
                  {vote.results.byCapital.map((result) => (
                    <div key={result.option} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{result.option}</span>
                        <span>
                          {result.capitalWeight}% ({result.percentage}%)
                        </span>
                      </div>
                      <Progress
                        value={parseFloat(result.percentage)}
                        className={`h-2 ${
                          result.option === "Ja"
                            ? "[&>div]:bg-green-500"
                            : result.option === "Nein"
                            ? "[&>div]:bg-red-500"
                            : ""
                        }`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {vote.status === "CLOSED" && vote.stats.isApproved !== null && (
              <div
                className={`mt-6 p-4 rounded-lg ${
                  vote.stats.isApproved
                    ? "bg-green-50 border border-green-200"
                    : "bg-red-50 border border-red-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  {vote.stats.isApproved ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  <span
                    className={`font-medium ${
                      vote.stats.isApproved ? "text-green-800" : "text-red-800"
                    }`}
                  >
                    {vote.stats.isApproved
                      ? "Beschluss angenommen"
                      : "Beschluss abgelehnt"}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabs for Voters */}
      <Tabs defaultValue="voted">
        <TabsList>
          <TabsTrigger value="voted">
            Abgestimmt ({vote.stats.totalResponses})
          </TabsTrigger>
          <TabsTrigger value="pending">
            Ausstehend ({vote.stats.totalEligible - vote.stats.totalResponses})
          </TabsTrigger>
          <TabsTrigger value="all">
            Alle ({vote.stats.totalEligible})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="voted" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gesellschafter</TableHead>
                    <TableHead>Nr.</TableHead>
                    <TableHead>Stimmrecht</TableHead>
                    <TableHead>Stimme</TableHead>
                    <TableHead>Abgestimmt am</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vote.responses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Noch keine Stimmen abgegeben
                      </TableCell>
                    </TableRow>
                  ) : (
                    vote.responses.map((response) => (
                      <TableRow key={response.id}>
                        <TableCell className="font-medium">
                          {response.shareholder.name}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {response.shareholder.shareholderNumber || "-"}
                        </TableCell>
                        <TableCell>
                          {response.shareholder.votingRights?.toFixed(2)}%
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={
                              response.selectedOption === "Ja"
                                ? "bg-green-100 text-green-800"
                                : response.selectedOption === "Nein"
                                ? "bg-red-100 text-red-800"
                                : "bg-gray-100 text-gray-800"
                            }
                          >
                            {response.selectedOption}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {format(new Date(response.votedAt), "dd.MM.yyyy HH:mm", {
                            locale: de,
                          })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gesellschafter</TableHead>
                    <TableHead>Nr.</TableHead>
                    <TableHead>Stimmrecht</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vote.eligibleShareholders.filter((sh) => !sh.hasVoted).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Alle haben abgestimmt
                      </TableCell>
                    </TableRow>
                  ) : (
                    vote.eligibleShareholders
                      .filter((sh) => !sh.hasVoted)
                      .map((sh) => (
                        <TableRow key={sh.id}>
                          <TableCell className="font-medium">{sh.name}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {sh.shareholderNumber || "-"}
                          </TableCell>
                          <TableCell>{sh.votingRights?.toFixed(2)}%</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              <Clock className="mr-1 h-3 w-3" />
                              Ausstehend
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Gesellschafter</TableHead>
                    <TableHead>Nr.</TableHead>
                    <TableHead>Stimmrecht</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vote.eligibleShareholders.map((sh) => (
                    <TableRow key={sh.id}>
                      <TableCell className="font-medium">{sh.name}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {sh.shareholderNumber || "-"}
                      </TableCell>
                      <TableCell>{sh.votingRights?.toFixed(2)}%</TableCell>
                      <TableCell>
                        {sh.hasVoted ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Abgestimmt
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <Clock className="mr-1 h-3 w-3" />
                            Ausstehend
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Meta Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Details</CardTitle>
            <InfoTooltip text="Zeitraum, Abstimmungstyp und zugehörige Gesellschaft." />
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 md:grid-cols-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Zeitraum</dt>
              <dd className="font-medium">
                {format(new Date(vote.startDate), "dd.MM.yyyy", { locale: de })} -{" "}
                {format(new Date(vote.endDate), "dd.MM.yyyy", { locale: de })}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Erstellt von</dt>
              <dd className="font-medium">{vote.createdBy || "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Erstellt am</dt>
              <dd className="font-medium">
                {format(new Date(vote.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
