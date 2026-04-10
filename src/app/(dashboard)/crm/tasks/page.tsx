"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, formatDistanceToNow, isBefore, isToday } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
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

function linkedEntityLabel(
  task: TaskItem,
  leaseFallback: string,
): { label: string; href: string; icon: React.ReactNode } | null {
  if (task.person) {
    return {
      label: personLabel(task.person),
      href: `/crm/contacts/${task.person.id}`,
      icon: <UserIcon className="h-3 w-3" />,
    };
  }
  if (task.fund) {
    return {
      label: task.fund.name,
      href: `/funds/${task.fund.id}`,
      icon: <Building2 className="h-3 w-3" />,
    };
  }
  if (task.lease) {
    return {
      label:
        [task.lease.lessor.firstName, task.lease.lessor.lastName]
          .filter(Boolean)
          .join(" ") || leaseFallback,
      href: `/leases/${task.lease.id}`,
      icon: <FileText className="h-3 w-3" />,
    };
  }
  if (task.park) {
    return {
      label: task.park.name,
      href: `/parks/${task.park.id}`,
      icon: <Wind className="h-3 w-3" />,
    };
  }
  return null;
}

export default function CrmTasksPage() {
  const { flags } = useFeatureFlags();
  const t = useTranslations("crm.tasks");
  const tContacts = useTranslations("crm.contacts");
  const locale = useLocale();
  const dateLocale = locale === "en" ? enUS : de;
  const dateFormat = locale === "en" ? "yyyy-MM-dd" : "dd.MM.yyyy";
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
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      toast.success(t("markedDone"));
      setTasks((prev) => prev.filter((task) => task.id !== id));
    } catch {
      toast.error(t("updateError"));
    }
  };

  const filteredTasks = useMemo(() => {
    const now = new Date();
    return tasks.filter((task) => {
      if (filter === "all") return true;
      if (!task.dueDate) return filter === "upcoming";
      const due = new Date(task.dueDate);
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
    for (const task of tasks) {
      if (!task.dueDate) {
        upcoming++;
        continue;
      }
      const due = new Date(task.dueDate);
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
        <h2 className="text-lg font-semibold">{tContacts("crmDisabled")}</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          {tContacts("crmDisabledHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} description={t("description")} />

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="all">
            {t("filterAll")}
            <Badge variant="secondary" className="ml-2">
              {counts.all}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="overdue">
            {t("filterOverdue")}
            {counts.overdue > 0 ? (
              <Badge variant="destructive" className="ml-2">
                {counts.overdue}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="today">
            {t("filterToday")}
            {counts.today > 0 ? (
              <Badge variant="default" className="ml-2">
                {counts.today}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="upcoming">
            {t("filterUpcoming")}
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
            {t("noTasks")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => {
            const linked = linkedEntityLabel(task, t("leaseFallback"));
            const due = task.dueDate ? new Date(task.dueDate) : null;
            const overdue = due
              ? isBefore(due, new Date()) && !isToday(due)
              : false;
            return (
              <Card
                key={task.id}
                className={overdue ? "border-destructive/50" : ""}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base font-medium flex items-center gap-2">
                      <CheckSquare className="h-4 w-4 text-muted-foreground" />
                      {task.title}
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => markDone(task.id)}
                    >
                      {t("markDone")}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 text-sm space-y-2">
                  {task.description && (
                    <p className="text-muted-foreground">{task.description}</p>
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
                        {t("dueBadge", {
                          date: format(due, dateFormat, { locale: dateLocale }),
                        })}
                        {overdue
                          ? ` (${t("overdueSuffix", {
                              distance: formatDistanceToNow(due, {
                                locale: dateLocale,
                                addSuffix: false,
                              }),
                            })})`
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
                    {task.assignedTo && (
                      <Badge variant="secondary">
                        {personLabel(task.assignedTo)}
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
