"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ClipboardCheck, ListChecks, Repeat, Wind } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

// =============================================================================
// TYPES
// =============================================================================

interface ChecklistItem {
  label: string;
  required?: boolean;
}

interface Checklist {
  id: string;
  title: string;
  description: string | null;
  recurrence: string | null;
  isActive: boolean;
  items: ChecklistItem[];
  park: { id: string; name: string } | null;
  _count: { tasks: number };
  createdAt: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const recurrenceColors: Record<string, string> = {
  DAILY: "bg-orange-100 text-orange-800",
  WEEKLY: "bg-blue-100 text-blue-800",
  MONTHLY: "bg-purple-100 text-purple-800",
  ONCE: "bg-gray-100 text-gray-800",
};

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function ChecklistsListPage() {
  const t = useTranslations("managementBilling.checklistsList");
  const router = useRouter();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setIsError(false);
      try {
        const res = await fetch("/api/management-billing/checklists");
        if (!res.ok) throw new Error("Failed to fetch checklists");
        const json = await res.json();
        if (!cancelled) {
          setChecklists(json.checklists ?? []);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={t("title")}
        description={t("description")}
        createHref="/management-billing/checklists/new"
        createLabel={t("createLabel")}
      />

      {/* Content */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-destructive">{t("errorLoading")}</p>
          </CardContent>
        </Card>
      ) : checklists.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={ClipboardCheck}
              title={t("empty.title")}
              description={t("empty.description")}
              action={
                <Button asChild>
                  <Link href="/management-billing/checklists/new">
                    {t("empty.action")}
                  </Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {checklists.map((checklist) => (
            <Card
              key={checklist.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() =>
                router.push(`/management-billing/checklists/${checklist.id}`)
              }
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg">{checklist.title}</CardTitle>
                  {checklist.recurrence && (
                    <Badge
                      variant="secondary"
                      className={
                        recurrenceColors[checklist.recurrence] ?? ""
                      }
                    >
                      <Repeat className="mr-1 h-3 w-3" />
                      {t(`recurrence.${checklist.recurrence}` as never)}
                    </Badge>
                  )}
                </div>
                {checklist.description && (
                  <CardDescription className="line-clamp-2">
                    {checklist.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ListChecks className="h-4 w-4" />
                    {Array.isArray(checklist.items)
                      ? checklist.items.length
                      : 0}{" "}
                    {t("card.items")}
                  </span>
                  {checklist.park && (
                    <span className="flex items-center gap-1">
                      <Wind className="h-4 w-4" />
                      {checklist.park.name}
                    </span>
                  )}
                  <span className="ml-auto">
                    {checklist._count.tasks}{" "}
                    {checklist._count.tasks === 1
                      ? t("card.tasksOne")
                      : t("card.tasksOther")}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
