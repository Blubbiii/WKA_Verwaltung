"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, formatDistanceToNow, isBefore, isToday } from "date-fns";
import { de } from "date-fns/locale";
import {
  CheckSquare,
  Clock,
  AlertCircle,
  User as UserIcon,
  Building2,
  Wind,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

interface CrmUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  createdAt: string;
  createdBy: CrmUser;
  assignedTo: CrmUser | null;
  person: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  fund: { id: string; name: string } | null;
  lease: {
    id: string;
    lessor: { firstName: string | null; lastName: string | null };
  } | null;
  park: { id: string; name: string } | null;
}

type Filter = "all" | "overdue" | "today" | "upcoming";

function personLabel(p: CrmUser | null): string {
  if (!p) return "—";
  return [p.firstName, p.lastName].filter(Boolean).join(" ") || "—";
}

function linkedEntityLabel(t: TaskItem): {
  label: string;
  href: string;
  icon: React.ReactNode;
} | null {
  if (t.person) {
    return {
      label: personLabel(t.person),
      href: `/crm/contacts/${t.person.id}`,
      icon: <UserIcon className="h-3 w-3" />,
    };
  }
  if (t.fund) {
    return {
      label: t.fund.name,
      href: `/funds/${t.fund.id}`,
      icon: <Building2 className="h-3 w-3" />,
    };
  }
  if (t.lease) {
    return {
      label:
        [t.lease.lessor.firstName, t.lease.lessor.lastName]
          .filter(Boolean)
          .join(" ") || "Pachtvertrag",
      href: `/leases/${t.lease.id}`,
      icon: <FileText className="h-3 w-3" />,
    };
  }
  if (t.park) {
    return {
      label: t.park.name,
      href: `/parks/${t.park.id}`,
      icon: <Wind className="h-3 w-3" />,
    };
  }
  return null;
}

export default function CrmTasksPage() {
  const { flags } = useFeatureFlags();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        "/api/crm/activities?type=TASK&status=PENDING&limit=200",
      );
      if (!res.ok) throw new Error();
      setTasks(await res.json());
    } catch {
      toast.error("Aufgaben konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markDone = async (id: string) => {
    try {
      const res = await fetch(`/api/crm/activities/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DONE" }),
      });
      if (!res.ok) throw new Error();
      toast.success("Als erledigt markiert");
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch {
      toast.error("Fehler beim Aktualisieren");
    }
  };

  const filteredTasks = useMemo(() => {
    const now = new Date();
    return tasks.filter((t) => {
      if (filter === "all") return true;
      if (!t.dueDate) return filter === "upcoming";
      const due = new Date(t.dueDate);
      switch (filter) {
        case "overdue":
          return isBefore(due, now) && !isToday(due);
        case "today":
          return isToday(due);
        case "upcoming":
          return due.getTime() > now.getTime() && !isToday(due);
        default:
          return true;
      }
    });
  }, [tasks, filter]);

  const counts = useMemo(() => {
    const now = new Date();
    let overdue = 0;
    let today = 0;
    let upcoming = 0;
    for (const t of tasks) {
      if (!t.dueDate) {
        upcoming++;
        continue;
      }
      const due = new Date(t.dueDate);
      if (isBefore(due, now) && !isToday(due)) overdue++;
      else if (isToday(due)) today++;
      else upcoming++;
    }
    return { all: tasks.length, overdue, today, upcoming };
  }, [tasks]);

  if (!flags.crm) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <CheckSquare className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold">CRM nicht aktiviert</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Das CRM-Modul ist für diesen Mandanten nicht freigeschaltet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aufgaben"
        description="Offene Aufgaben aus dem CRM. Erledige sie direkt, um sie aus der Liste zu entfernen."
      />

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="all">
            Alle
            <Badge variant="secondary" className="ml-2">
              {counts.all}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="overdue">
            Überfällig
            {counts.overdue > 0 ? (
              <Badge variant="destructive" className="ml-2">
                {counts.overdue}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="today">
            Heute
            {counts.today > 0 ? (
              <Badge variant="default" className="ml-2">
                {counts.today}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="upcoming">
            Bevorstehend
            <Badge variant="secondary" className="ml-2">
              {counts.upcoming}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : filteredTasks.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Keine Aufgaben in dieser Ansicht.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((t) => {
            const linked = linkedEntityLabel(t);
            const due = t.dueDate ? new Date(t.dueDate) : null;
            const overdue = due
              ? isBefore(due, new Date()) && !isToday(due)
              : false;
            return (
              <Card key={t.id} className={overdue ? "border-destructive/50" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base font-medium flex items-center gap-2">
                      <CheckSquare className="h-4 w-4 text-muted-foreground" />
                      {t.title}
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => markDone(t.id)}
                    >
                      Erledigen
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 text-sm space-y-2">
                  {t.description && (
                    <p className="text-muted-foreground">{t.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {due && (
                      <Badge
                        variant={overdue ? "destructive" : "outline"}
                        className="gap-1"
                      >
                        {overdue ? (
                          <AlertCircle className="h-3 w-3" />
                        ) : (
                          <Clock className="h-3 w-3" />
                        )}
                        Fällig {format(due, "dd.MM.yyyy", { locale: de })}
                        {overdue
                          ? ` (${formatDistanceToNow(due, { locale: de, addSuffix: false })} überfällig)`
                          : ""}
                      </Badge>
                    )}
                    {linked && (
                      <Link
                        href={linked.href}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded border hover:bg-muted/50"
                      >
                        {linked.icon}
                        {linked.label}
                      </Link>
                    )}
                    {t.assignedTo && (
                      <Badge variant="secondary">
                        {personLabel(t.assignedTo)}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
