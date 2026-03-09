"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ClipboardList,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ListTodo,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { SearchFilter } from "@/components/ui/search-filter";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatsCards } from "@/components/ui/stats-cards";

// =============================================================================
// TYPES
// =============================================================================

type TaskStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  dueDate: string | null;
  notes: string | null;
  park: { id: string; name: string } | null;
  turbine: { id: string; name: string } | null;
  assignedTo: { id: string; name: string; email: string } | null;
  checklist: { id: string; title: string } | null;
  createdAt: string;
}

interface ParkOption {
  id: string;
  name: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const statusLabels: Record<TaskStatus, string> = {
  OPEN: "Offen",
  IN_PROGRESS: "In Bearbeitung",
  DONE: "Erledigt",
  CANCELLED: "Abgebrochen",
};

const statusColors: Record<TaskStatus, string> = {
  OPEN: "bg-yellow-100 text-yellow-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  DONE: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-100 text-gray-800",
};

const priorityLabels: Record<number, string> = {
  1: "Hoch",
  2: "Normal",
  3: "Niedrig",
};

const priorityColors: Record<number, string> = {
  1: "bg-red-100 text-red-800",
  2: "bg-blue-100 text-blue-800",
  3: "bg-gray-100 text-gray-800",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("de-DE");
  } catch {
    return "-";
  }
}

function isOverdue(task: Task): boolean {
  if (!task.dueDate || task.status === "DONE" || task.status === "CANCELLED")
    return false;
  return new Date(task.dueDate) < new Date();
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function TasksListPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  // Filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [parkFilter, setParkFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setIsError(false);
      try {
        const [tasksRes, parksRes] = await Promise.all([
          fetch("/api/management-billing/tasks?taskType=OPERATIONAL&limit=200"),
          fetch("/api/parks?limit=100"),
        ]);

        if (!cancelled) {
          if (tasksRes.ok) {
            const json = await tasksRes.json();
            setTasks(json.tasks ?? []);
          } else {
            setIsError(true);
          }

          if (parksRes.ok) {
            const json = await parksRes.json();
            const parkList = (json.data ?? []).map(
              (p: { id: string; name: string }) => ({
                id: p.id,
                name: p.name,
              })
            );
            setParks(parkList);
          }
        }
      } catch {
        if (!cancelled) setIsError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Filtered tasks
  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (search) {
        const q = search.toLowerCase();
        const matchesSearch =
          t.title.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.park?.name.toLowerCase().includes(q) ||
          t.assignedTo?.name.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (parkFilter !== "all" && t.park?.id !== parkFilter) return false;
      return true;
    });
  }, [tasks, search, statusFilter, parkFilter]);

  // Stats
  const stats = useMemo(() => {
    const total = tasks.length;
    const open = tasks.filter((t) => t.status === "OPEN").length;
    const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
    const overdue = tasks.filter(isOverdue).length;

    return [
      {
        label: "Gesamt",
        value: total,
        icon: ListTodo,
      },
      {
        label: "Offen",
        value: open,
        icon: Clock,
      },
      {
        label: "In Bearbeitung",
        value: inProgress,
        icon: CheckCircle2,
      },
      {
        label: "Ueberfaellig",
        value: overdue,
        icon: AlertTriangle,
        cardClassName: overdue > 0 ? "border-l-red-400" : undefined,
        valueClassName: overdue > 0 ? "text-red-600" : undefined,
      },
    ];
  }, [tasks]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Aufgaben"
        description="Betriebliche Aufgaben verwalten und nachverfolgen"
        createHref="/management-billing/tasks/new"
        createLabel="Neue Aufgabe"
      />

      {/* Stats */}
      {!isLoading && !isError && <StatsCards stats={stats} columns={4} />}

      {/* Filter Bar */}
      <SearchFilter
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Aufgabe, Park oder Zugewiesenen suchen..."
        filters={[
          {
            value: statusFilter,
            onChange: setStatusFilter,
            placeholder: "Alle Status",
            options: [
              { value: "all", label: "Alle Status" },
              { value: "OPEN", label: "Offen" },
              { value: "IN_PROGRESS", label: "In Bearbeitung" },
              { value: "DONE", label: "Erledigt" },
              { value: "CANCELLED", label: "Abgebrochen" },
            ],
            width: "w-[180px]",
          },
          {
            value: parkFilter,
            onChange: setParkFilter,
            placeholder: "Alle Parks",
            options: [
              { value: "all", label: "Alle Parks" },
              ...parks.map((p) => ({ value: p.id, label: p.name })),
            ],
            width: "w-[200px]",
          },
        ]}
      />

      {/* Table */}
      {isLoading ? (
        <Card>
          <CardContent className="py-6">
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-24" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-destructive">
              Fehler beim Laden der Aufgaben. Bitte versuchen Sie es erneut.
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={ClipboardList}
              title={
                tasks.length === 0
                  ? "Keine Aufgaben vorhanden"
                  : "Keine Ergebnisse"
              }
              description={
                tasks.length === 0
                  ? "Erstellen Sie die erste Aufgabe, um Betriebsablaeufe zu verfolgen."
                  : "Passen Sie Ihre Suchkriterien an, um Ergebnisse zu finden."
              }
              action={
                tasks.length === 0 ? (
                  <Button asChild>
                    <Link href="/management-billing/tasks/new">
                      Neue Aufgabe erstellen
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Titel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Prioritaet</TableHead>
                    <TableHead>Park</TableHead>
                    <TableHead>Zugewiesen an</TableHead>
                    <TableHead>Faellig am</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((task) => (
                    <TableRow
                      key={task.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() =>
                        router.push(`/management-billing/tasks/${task.id}`)
                      }
                    >
                      <TableCell className="font-medium">
                        {task.title}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={statusColors[task.status] ?? ""}
                        >
                          {statusLabels[task.status] ?? task.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={priorityColors[task.priority] ?? ""}
                        >
                          {priorityLabels[task.priority] ?? `P${task.priority}`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {task.park?.name ?? "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {task.assignedTo?.name ?? "-"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            isOverdue(task) ? "text-red-600 font-medium" : ""
                          }
                        >
                          {formatDate(task.dueDate)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
