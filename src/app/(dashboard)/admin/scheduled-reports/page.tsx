"use client";

/**
 * Admin: Geplante Berichte (Scheduled Reports).
 *
 * Nutzt die bestehende `ScheduledReportsManager`-Komponente, die bereits
 * die komplette Tabelle (Aktivieren/Deaktivieren, Bearbeiten, Löschen,
 * "Jetzt ausführen") und das New-Dialog implementiert.
 *
 * Backend: /api/admin/scheduled-reports (GET/POST)
 *          /api/admin/scheduled-reports/[id] (PATCH/DELETE)
 */

import { PageHeader } from "@/components/ui/page-header";
import { ScheduledReportsManager } from "@/components/reports/scheduled-reports-manager";

export default function ScheduledReportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Geplante Berichte"
        description="Automatisierte Reports (Monatlich, Quartalsweise, Jährlich) konfigurieren und überwachen."
      />
      <ScheduledReportsManager />
    </div>
  );
}
