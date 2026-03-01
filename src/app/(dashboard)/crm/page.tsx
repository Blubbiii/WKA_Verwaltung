"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import {
  Users,
  CheckSquare,
  Activity,
  AlertCircle,
  Phone,
  Mail,
  CalendarDays,
  FileText,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { ActivityFormDialog } from "@/components/crm/activity-form-dialog";

// ============================================================================
// Types
// ============================================================================

type ActivityType = "CALL" | "EMAIL" | "MEETING" | "NOTE" | "TASK";

interface CrmUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

interface CrmActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  status: string;
  dueDate: string | null;
  createdAt: string;
  createdBy: CrmUser;
  person: { id: string; firstName: string | null; lastName: string | null } | null;
  fund: { id: string; name: string } | null;
  assignedTo: CrmUser | null;
}

interface InactiveContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  contactType: string | null;
  lastActivityAt: string | null;
  _count: { crmActivities: number };
}

interface DashboardData {
  kpis: {
    totalContacts: number;
    openTasks: number;
    activitiesThisMonth: number;
    inactiveContactsCount: number;
  };
  recentActivities: CrmActivityItem[];
  upcomingTasks: CrmActivityItem[];
  inactiveContacts: InactiveContact[];
}

// ============================================================================
// Helpers
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

function personName(p: CrmUser | null) {
  if (!p) return "—";
  return `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();
}

function entityLabel(a: CrmActivityItem) {
  if (a.person) return personName(a.person);
  if (a.fund) return a.fund.name;
  return "—";
}

// ============================================================================
// Page
// ============================================================================

export default function CrmDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/crm/dashboard");
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      toast.error("Dashboard konnte nicht geladen werden");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM"
        description="Kontaktpflege und Aktivitäten"
        actions={
          <Button onClick={() => setAddOpen(true)}>
            + Aktivität
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-16" /></CardContent></Card>
          ))
        ) : data ? (
          <>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Users className="h-8 w-8 text-primary" />
                  <div>
                    <div className="text-2xl font-bold">{data.kpis.totalContacts}</div>
                    <div className="text-xs text-muted-foreground">Kontakte</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <CheckSquare className="h-8 w-8 text-amber-500" />
                  <div>
                    <div className="text-2xl font-bold">{data.kpis.openTasks}</div>
                    <div className="text-xs text-muted-foreground">Offene Aufgaben</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <Activity className="h-8 w-8 text-green-500" />
                  <div>
                    <div className="text-2xl font-bold">{data.kpis.activitiesThisMonth}</div>
                    <div className="text-xs text-muted-foreground">Aktivitäten diesen Monat</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                  <div>
                    <div className="text-2xl font-bold">{data.kpis.inactiveContactsCount}</div>
                    <div className="text-xs text-muted-foreground">Inaktiv &gt;90 Tage</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Activities */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Letzte Aktivitäten</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-3 p-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : data?.recentActivities.length ? (
              <div className="divide-y">
                {data.recentActivities.map((a) => {
                  const Icon = TYPE_ICONS[a.type];
                  return (
                    <div key={a.id} className="flex items-start gap-3 px-4 py-3">
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{a.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {TYPE_LABELS[a.type]} · {entityLabel(a)} ·{" "}
                          {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true, locale: de })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">Noch keine Aktivitäten</div>
            )}
          </CardContent>
        </Card>

        {/* Open Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Offene Aufgaben</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-3 p-4">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : data?.upcomingTasks.length ? (
              <div className="divide-y">
                {data.upcomingTasks.map((t) => {
                  const overdue = t.dueDate && new Date(t.dueDate) < new Date();
                  return (
                    <div key={t.id} className="flex items-start gap-3 px-4 py-3">
                      <CheckSquare className={`mt-0.5 h-4 w-4 shrink-0 ${overdue ? "text-destructive" : "text-amber-500"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{t.title}</div>
                        <div className={`flex items-center gap-1 text-xs ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                          {t.dueDate && (
                            <>
                              <Clock className="h-3 w-3" />
                              {overdue ? "Überfällig: " : "Fällig: "}
                              {format(new Date(t.dueDate), "dd.MM.yyyy", { locale: de })}
                            </>
                          )}
                          {t.assignedTo && (
                            <span className="text-muted-foreground">· {personName(t.assignedTo)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">Keine offenen Aufgaben</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Inactive Contacts */}
      {data && data.inactiveContacts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-destructive" />
              Kontakte ohne Aktivität (&gt;90 Tage)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {data.inactiveContacts.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => router.push(`/crm/contacts/${c.id}`)}
                >
                  <div>
                    <div className="text-sm font-medium">
                      {c.firstName || c.lastName
                        ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim()
                        : c.companyName ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.contactType && <Badge variant="outline" className="text-xs py-0 mr-2">{c.contactType}</Badge>}
                      {c.lastActivityAt
                        ? `Zuletzt: ${format(new Date(c.lastActivityAt), "dd.MM.yyyy", { locale: de })}`
                        : "Noch keine Aktivität"}
                    </div>
                  </div>
                  <Badge variant="secondary">{c._count.crmActivities} Aktivitäten</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick-add dialog: needs a dummy entity — we skip for dashboard-level add */}
      {addOpen && (
        <ActivityFormDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          entityType="person"
          entityId=""
          onSuccess={load}
        />
      )}
    </div>
  );
}
