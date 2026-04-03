"use client";

import Link from "next/link";
import {
  Wind,
  Building2,
  Receipt,
  FileSignature,
  ScrollText,
  Clock,
} from "lucide-react";
import { useRecentlyVisited, type RecentVisit } from "@/hooks/useRecentlyVisited";
import { formatRelativeTime } from "@/lib/notifications/notification-ui";

const TYPE_ICONS: Record<RecentVisit["type"], React.ElementType> = {
  park: Wind,
  fund: Building2,
  invoice: Receipt,
  lease: FileSignature,
  contract: ScrollText,
};

const TYPE_LABELS: Record<RecentVisit["type"], string> = {
  park: "Park",
  fund: "Gesellschaft",
  invoice: "Rechnung",
  lease: "Pacht",
  contract: "Vertrag",
};

export function RecentlyVisitedWidget() {
  const { visits } = useRecentlyVisited();

  if (visits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm py-6">
        <Clock className="h-8 w-8 mb-2 opacity-50" />
        <p>Noch keine besuchten Seiten</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {visits.slice(0, 8).map((visit) => {
        const Icon = TYPE_ICONS[visit.type] || Wind;
        return (
          <Link
            key={`${visit.type}-${visit.id}`}
            href={visit.href}
            className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors group"
          >
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate group-hover:text-primary transition-colors">
                {visit.name}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {TYPE_LABELS[visit.type]} · {formatRelativeTime(visit.visitedAt)}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
