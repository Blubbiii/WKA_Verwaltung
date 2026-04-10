"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, FileText, Lock, CheckCircle, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

const STATUS_META = {
  DRAFT: { icon: Edit3, variant: "secondary" as const, key: "statusDraft" },
  APPROVED: {
    icon: CheckCircle,
    variant: "default" as const,
    key: "statusApproved",
  },
  LOCKED: { icon: Lock, variant: "outline" as const, key: "statusLocked" },
} as const;

interface Budget {
  id: string;
  year: number;
  name: string;
  status: "DRAFT" | "APPROVED" | "LOCKED";
  notes: string | null;
  _count: { lines: number };
  createdAt: string;
}

export default function BudgetListPage() {
  const router = useRouter();
  const t = useTranslations("wirtschaftsplan.budget");
  const { data, isLoading } = useQuery<Budget[]>({
    queryKey: ["/api/wirtschaftsplan/budgets"],
    queryFn: () => fetcher("/api/wirtschaftsplan/budgets"),
  });

  const byYear = (data ?? []).reduce<Record<number, Budget[]>>((acc, b) => {
    acc[b.year] = acc[b.year] ?? [];
    acc[b.year].push(b);
    return acc;
  }, {});

  const sortedYears = Object.keys(byYear)
    .map(Number)
    .sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button onClick={() => router.push("/wirtschaftsplan/budget/new")}>
          <Plus className="h-4 w-4 mr-2" />
          {t("newButton")}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sortedYears.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="font-medium">{t("emptyTitle")}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {t("emptyHint")}
            </p>
            <Button
              className="mt-4"
              onClick={() => router.push("/wirtschaftsplan/budget/new")}
            >
              <Plus className="h-4 w-4 mr-2" />
              {t("createButton")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {sortedYears.map((year) => (
            <div key={year}>
              <h2 className="text-lg font-semibold mb-3">{year}</h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {byYear[year].map((budget) => {
                  const meta = STATUS_META[budget.status];
                  const StatusIcon = meta.icon;
                  return (
                    <Card
                      key={budget.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() =>
                        router.push(`/wirtschaftsplan/budget/${budget.id}`)
                      }
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-sm font-medium leading-tight">
                            {budget.name}
                          </CardTitle>
                          <Badge
                            variant={meta.variant}
                            className="shrink-0 gap-1 text-xs"
                          >
                            <StatusIcon className="h-3 w-3" />
                            {t(meta.key)}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="text-xs text-muted-foreground">
                          {t("linesCount", { count: budget._count.lines })}
                        </p>
                        {budget.notes && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                            {budget.notes}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
