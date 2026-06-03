/**
 * P23: Mahn-Eskalationsstufen-Konfiguration.
 */

import { PageHeader } from "@/components/ui/page-header";
import { DunningStagesSettings } from "@/components/settings/DunningStagesSettings";

export default function MahnStufenPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Mahn-Eskalationsstufen"
        description="Konfiguration der 3 Mahnstufen mit Tagen und Gebühren"
      />
      <DunningStagesSettings />
    </div>
  );
}
