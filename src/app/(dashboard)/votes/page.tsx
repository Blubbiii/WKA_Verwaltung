"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDebounce } from "@/hooks/useDebounce";
import { useApiQuery, useApiMutation, useInvalidateQuery } from "@/hooks/useApiQuery";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Plus,
  Vote,
  Clock,
  CheckCircle,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Play,
  Square,
  Filter,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/ui/page-header";
import { StatsCards } from "@/components/ui/stats-cards";
import { SearchFilter } from "@/components/ui/search-filter";
import { toast } from "sonner";
import { VOTE_STATUS, getStatusBadge } from "@/lib/status-config";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";

interface VoteItem {
  id: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  fund: {
    id: string;
    name: string;
  };
  stats: {
    responseCount: number;
    eligibleVoters: number;
    participationRate: string;
  };
  createdAt: string;
}

const statusIcons: Record<string, React.ElementType> = {
  DRAFT: Pencil,
  ACTIVE: Play,
  CLOSED: Square,
};

interface VotesResponse {
  data: VoteItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function VotesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const limit = 20;

  const invalidate = useInvalidateQuery();

  // Build query URL
  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    ...(statusFilter !== "all" && { status: statusFilter }),
    ...(debouncedSearch && { search: debouncedSearch }),
  });

  const { data: votesData, isLoading: loading, error, refetch } = useApiQuery<VotesResponse>(
    ["votes", statusFilter, debouncedSearch, page.toString()],
    `/api/votes?${queryParams}`
  );

  const votes = votesData?.data ?? [];
  const pagination = votesData?.pagination ?? { page: 1, limit, total: 0, totalPages: 0 };

  // Status update mutation
  const statusMutation = useApiMutation(
    async ({ id, status }: { id: string; status: string }) => {
      const response = await fetch(`/api/votes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Fehler beim Aktualisieren" }));
        throw new Error(error.error || "Fehler beim Aktualisieren");
      }
      return response.json();
    },
    {
      onSuccess: () => {
        invalidate(["votes"]);
      },
      onError: (error) => {
        toast.error(error.message || "Fehler beim Aktualisieren der Abstimmung");
      },
    }
  );

  // Delete mutation
  const deleteMutation = useApiMutation(
    async (id: string) => {
      const response = await fetch(`/api/votes/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Fehler beim Löschen" }));
        throw new Error(data.error || "Fehler beim Löschen");
      }
      return response.json();
    },
    {
      onSuccess: () => {
        invalidate(["votes"]);
      },
      onError: (error) => {
        toast.error(error.message || "Fehler beim Löschen der Abstimmung");
      },
      onSettled: () => {
        setDeleteId(null);
      },
    }
  );

  // Stats (computed from current page data - approximate for display)
  const draftVotes = votes.filter((v) => v.status === "DRAFT");
  const activeVotes = votes.filter((v) => v.status === "ACTIVE");
  const closedVotes = votes.filter((v) => v.status === "CLOSED");

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive">Fehler beim Laden der Abstimmungen</p>
        <Button onClick={() => refetch()} variant="outline" className="mt-4">
          Erneut versuchen
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Abstimmungen"
        description="Verwalten Sie Gesellschafterbeschlüsse und Abstimmungen"
        createHref="/votes/new"
        createLabel="Neue Abstimmung"
        actions={
          <Button variant="outline" asChild>
            <Link href="/votes/proxies">
              <UserCheck className="mr-2 h-4 w-4" />
              Vollmachten
            </Link>
          </Button>
        }
      />

      {/* Stats Cards */}
      <StatsCards
        stats={[
          { label: "Gesamt", value: pagination.total, icon: Vote, subtitle: "Abstimmungen" },
          { label: "Entwürfe", value: draftVotes.length, icon: Pencil, iconClassName: "text-gray-500", subtitle: "Noch nicht gestartet" },
          { label: "Aktiv", value: activeVotes.length, icon: Play, iconClassName: "text-green-600", valueClassName: "text-green-600", subtitle: "Laufende Abstimmungen" },
          { label: "Beendet", value: closedVotes.length, icon: CheckCircle, iconClassName: "text-blue-600", subtitle: "Abgeschlossen" },
        ]}
      />

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <CardTitle>Alle Abstimmungen</CardTitle>
          <CardDescription>Übersicht aller Gesellschafterbeschlüsse</CardDescription>
        </CardHeader>
        <CardContent>
          <SearchFilter
            search={search}
            onSearchChange={(val) => { setSearch(val); setPage(1); }}
            searchPlaceholder="Suchen nach Titel, Gesellschaft..."
            filters={[
              {
                value: statusFilter,
                onChange: (val) => { setStatusFilter(val); setPage(1); },
                placeholder: "Status",
                icon: <Filter className="mr-2 h-4 w-4" />,
                width: "w-[150px]",
                options: [
                  { value: "all", label: "Alle Status" },
                  { value: "DRAFT", label: "Entwurf" },
                  { value: "ACTIVE", label: "Aktiv" },
                  { value: "CLOSED", label: "Beendet" },
                ],
              },
            ]}
          />

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Abstimmung</TableHead>
                  <TableHead>Gesellschaft</TableHead>
                  <TableHead>Zeitraum</TableHead>
                  <TableHead>Beteiligung</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : votes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      Keine Abstimmungen gefunden
                    </TableCell>
                  </TableRow>
                ) : (
                  votes.map((vote) => {
                    const config = getStatusBadge(VOTE_STATUS, vote.status);
                    const StatusIcon = statusIcons[vote.status] || Pencil;

                    return (
                      <TableRow
                        key={vote.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => router.push(`/votes/${vote.id}`)}
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/votes/${vote.id}`); } }}
                      >
                        <TableCell>
                          <div>
                            <p className="font-medium">{vote.title}</p>
                            {vote.description && (
                              <p className="text-sm text-muted-foreground line-clamp-1">
                                {vote.description}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{vote.fund.name}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>
                              {format(new Date(vote.startDate), "dd.MM.yyyy", { locale: de })}
                            </p>
                            <p className="text-muted-foreground">
                              bis {format(new Date(vote.endDate), "dd.MM.yyyy", { locale: de })}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Progress
                                value={parseFloat(vote.stats.participationRate)}
                                className="h-2 w-16"
                              />
                              <span className="text-sm">{vote.stats.participationRate}%</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {vote.stats.responseCount} / {vote.stats.eligibleVoters} Stimmen
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={config.className}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Details anzeigen"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/votes/${vote.id}`);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {vote.status === "DRAFT" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="Bearbeiten"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/votes/${vote.id}/edit`);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Weitere Aktionen">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {vote.status === "DRAFT" && (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      statusMutation.mutate({ id: vote.id, status: "ACTIVE" });
                                    }}
                                  >
                                    <Play className="mr-2 h-4 w-4" />
                                    Starten
                                  </DropdownMenuItem>
                                )}
                                {vote.status === "ACTIVE" && (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      statusMutation.mutate({ id: vote.id, status: "CLOSED" });
                                    }}
                                  >
                                    <Square className="mr-2 h-4 w-4" />
                                    Beenden
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteId(vote.id);
                                  }}
                                  className="text-red-600"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Löschen
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Zeige {(pagination.page - 1) * pagination.limit + 1} bis{" "}
                {Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
                von {pagination.total} Abstimmungen
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Zurück
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Weiter
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        onConfirm={async () => {
          if (deleteId) {
            await deleteMutation.mutateAsync(deleteId);
          }
        }}
        title="Abstimmung löschen"
      />
    </div>
  );
}
