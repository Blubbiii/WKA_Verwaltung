"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import {
  Plus,
  Mail,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  XCircle,
  Eye,
  Lock,
} from "lucide-react";

// =============================================================================
// Types
// =============================================================================

interface Mailing {
  id: string;
  title: string;
  status: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  sentAt: string | null;
  createdAt: string;
  template: { name: string; category: string };
  fund: { name: string } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  DRAFT: { label: "Entwurf", color: "bg-gray-100 text-gray-800 border-gray-200", icon: Clock },
  SENDING: { label: "Wird gesendet", color: "bg-blue-100 text-blue-800 border-blue-200", icon: Loader2 },
  SENT: { label: "Gesendet", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle },
  PARTIALLY_FAILED: { label: "Teilweise fehlgeschlagen", color: "bg-amber-100 text-amber-800 border-amber-200", icon: AlertCircle },
  CANCELLED: { label: "Abgebrochen", color: "bg-red-100 text-red-800 border-red-200", icon: XCircle },
};

// =============================================================================
// Component
// =============================================================================

export default function KommunikationPage() {
  const router = useRouter();
  const { flags, loading: flagsLoading } = useFeatureFlags();
  const [mailings, setMailings] = useState<Mailing[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMailings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mailings?limit=50");
      if (res.ok) {
        const data = await res.json();
        setMailings(data.mailings ?? []);
      }
    } catch {
      toast.error("Mailings konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (flags.communication) fetchMailings();
  }, [fetchMailings, flags.communication]);

  // Feature flag guard
  if (flagsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!flags.communication) {
    return (
      <EmptyState
        icon={Lock}
        title="Modul nicht aktiviert"
        description="Das Kommunikations-Modul ist nicht aktiviert. Aktivieren Sie es unter Admin → System-Konfiguration → Features."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Serienbriefe"
        description="Vorlagenbasierte Massenkommunikation an Gesellschafter"
        actions={
          <Button onClick={() => router.push("/kommunikation/erstellen")}>
            <Plus className="mr-2 h-4 w-4" />
            Neues Mailing
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : mailings.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="Keine Mailings"
          description="Erstellen Sie Ihr erstes Mailing an Gesellschafter."
          action={
            <Button onClick={() => router.push("/kommunikation/erstellen")}>
              <Plus className="mr-2 h-4 w-4" />
              Mailing erstellen
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titel</TableHead>
                <TableHead>Vorlage</TableHead>
                <TableHead>Gesellschaft</TableHead>
                <TableHead>Empfaenger</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {mailings.map((m) => {
                const statusConfig = STATUS_CONFIG[m.status] ?? STATUS_CONFIG.DRAFT;
                const StatusIcon = statusConfig.icon;

                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.template.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {m.fund?.name ?? "Alle"}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {m.sentCount}/{m.recipientCount}
                        {m.failedCount > 0 && (
                          <span className="text-destructive ml-1">({m.failedCount} fehlgeschl.)</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusConfig.color}>
                        <StatusIcon className={`mr-1 h-3 w-3 ${m.status === "SENDING" ? "animate-spin" : ""}`} />
                        {statusConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(m.sentAt ?? m.createdAt).toLocaleDateString("de-DE")}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => router.push(`/kommunikation/${m.id}`)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
