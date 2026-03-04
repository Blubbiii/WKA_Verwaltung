import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ExternalLink, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonitoringDashboard } from "@/components/admin/monitoring-dashboard";

export default async function MonitoringPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const grafanaUrl = process.env.NEXT_PUBLIC_GRAFANA_URL;

  return (
    <div className="flex flex-col h-full gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Monitoring</h1>
        </div>
        {grafanaUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={grafanaUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Grafana öffnen
            </a>
          </Button>
        )}
      </div>

      {/* Native Monitoring Dashboard */}
      <MonitoringDashboard />
    </div>
  );
}
