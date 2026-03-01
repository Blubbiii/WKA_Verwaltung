"use client";

import { useState, useCallback } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import {
  Phone,
  Mail,
  CalendarDays,
  FileText,
  CheckSquare,
  Square,
  Plus,
  Pencil,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityFormDialog } from "./activity-form-dialog";
import type { ActivityType, ActivityFormData } from "./activity-form-dialog";

// ============================================================================
// Types
// ============================================================================

interface CrmActivityUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

interface CrmActivity {
  id: string;
  type: ActivityType;
  title: string;
  description: string | null;
  status: string;
  direction: string | null;
  duration: number | null;
  startTime: string | null;
  dueDate: string | null;
  createdAt: string;
  createdBy: CrmActivityUser;
  assignedTo: CrmActivityUser | null;
}

interface ActivityTimelineProps {
  entityType: "person" | "fund" | "lease" | "park";
  entityId: string;
}

// ============================================================================
// Icon map
// ============================================================================

const TYPE_ICONS: Record<ActivityType, React.ElementType> = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: CalendarDays,
  NOTE: FileText,
  TASK: CheckSquare,
};

const TYPE_LABELS: Record<ActivityType, string> = {
  CALL: "Anruf",
  EMAIL: "E-Mail",
  MEETING: "Meeting",
  NOTE: "Notiz",
  TASK: "Aufgabe",
};

const TYPE_COLORS: Record<ActivityType, string> = {
  CALL: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  EMAIL: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  MEETING: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  NOTE: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  TASK: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
};

function userName(u: CrmActivityUser | null) {
  if (!u) return "—";
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.id.slice(0, 8);
}

// ============================================================================
// Activity Card
// ============================================================================

function ActivityCard({
  activity,
  entityType,
  entityId,
  onDeleted,
  onUpdated,
}: {
  activity: CrmActivity;
  entityType: "person" | "fund" | "lease" | "park";
  entityId: string;
  onDeleted: (id: string) => void;
  onUpdated: (id: string) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const Icon = activity.type === "TASK" && activity.status !== "DONE"
    ? Square
    : TYPE_ICONS[activity.type];

  const handleDelete = async () => {
    if (!confirm("Aktivität löschen?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/crm/activities/${activity.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Fehler");
      toast.success("Aktivität gelöscht");
      onDeleted(activity.id);
    } catch {
      toast.error("Löschen fehlgeschlagen");
    } finally {
      setDeleting(false);
    }
  };

  const isOverdue =
    activity.type === "TASK" &&
    activity.status === "PENDING" &&
    activity.dueDate &&
    new Date(activity.dueDate) < new Date();

  return (
    <>
      <div className="group flex gap-3 py-3 border-b last:border-0">
        {/* Icon */}
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TYPE_COLORS[activity.type]}`}>
          <Icon className="h-4 w-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <span className="font-medium text-sm">{activity.title}</span>
              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-xs py-0">
                  {TYPE_LABELS[activity.type]}
                </Badge>
                {activity.direction && (
                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                    {activity.direction === "INBOUND"
                      ? <ArrowDownLeft className="h-3 w-3" />
                      : <ArrowUpRight className="h-3 w-3" />}
                    {activity.direction === "INBOUND" ? "Eingehend" : "Ausgehend"}
                  </span>
                )}
                {activity.duration && (
                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {activity.duration} Min.
                  </span>
                )}
                {activity.type === "TASK" && (
                  <Badge
                    variant={activity.status === "DONE" ? "secondary" : isOverdue ? "destructive" : "outline"}
                    className="text-xs py-0"
                  >
                    {activity.status === "DONE" ? "Erledigt" :
                     activity.status === "CANCELLED" ? "Abgebrochen" : "Offen"}
                  </Badge>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {activity.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{activity.description}</p>
          )}

          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span title={format(new Date(activity.createdAt), "dd.MM.yyyy HH:mm", { locale: de })}>
              {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true, locale: de })}
            </span>
            <span>· {userName(activity.createdBy)}</span>
            {activity.dueDate && activity.type === "TASK" && (
              <span className={isOverdue ? "text-destructive" : ""}>
                · Fällig: {format(new Date(activity.dueDate), "dd.MM.yyyy", { locale: de })}
              </span>
            )}
          </div>
        </div>
      </div>

      <ActivityFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        entityType={entityType}
        entityId={entityId}
        activity={{ id: activity.id, ...(activity as unknown as ActivityFormData) }}
        onSuccess={() => onUpdated(activity.id)}
      />
    </>
  );
}

// ============================================================================
// Main: ActivityTimeline
// ============================================================================

export function ActivityTimeline({ entityType, entityId }: ActivityTimelineProps) {
  const [activities, setActivities] = useState<CrmActivity[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/crm/activities?${entityType}Id=${entityId}&limit=100`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setActivities(data);
    } catch {
      toast.error("Aktivitäten konnten nicht geladen werden");
      setActivities([]);
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, [entityType, entityId]);

  // Lazy load on first render
  if (!initialized && !loading) {
    load();
  }

  const handleDeleted = (id: string) => {
    setActivities((prev) => prev?.filter((a) => a.id !== id) ?? null);
  };

  const handleSuccess = () => load();

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          {activities ? `${activities.length} Aktivität${activities.length !== 1 ? "en" : ""}` : ""}
        </span>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Aktivität
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3 py-3">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      ) : activities && activities.length > 0 ? (
        <div>
          {activities.map((a) => (
            <ActivityCard
              key={a.id}
              activity={a}
              entityType={entityType}
              entityId={entityId}
              onDeleted={handleDeleted}
              onUpdated={handleSuccess}
            />
          ))}
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Noch keine Aktivitäten.{" "}
          <button
            className="underline hover:no-underline"
            onClick={() => setAddOpen(true)}
          >
            Erste Aktivität erstellen
          </button>
        </div>
      )}

      <ActivityFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        entityType={entityType}
        entityId={entityId}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
