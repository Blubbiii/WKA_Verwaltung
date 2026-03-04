import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ExternalLink, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

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
              In neuem Tab öffnen
            </a>
          </Button>
        )}
      </div>

      {/* iFrame or placeholder */}
      {grafanaUrl ? (
        <div className="flex-1 rounded-lg border overflow-hidden">
          <iframe
            src={grafanaUrl}
            className="w-full h-full border-0"
            title="Grafana Monitoring"
            allow="fullscreen"
          />
        </div>
      ) : (
        <div className="flex-1 rounded-lg border border-dashed flex flex-col items-center justify-center gap-4 text-center p-8">
          <Activity className="h-12 w-12 text-muted-foreground/40" />
          <div className="space-y-2 max-w-md">
            <p className="text-lg font-medium">Grafana nicht konfiguriert</p>
            <p className="text-sm text-muted-foreground">
              Starten Sie den Grafana-Dienst im Docker-Stack und setzen Sie
              die Umgebungsvariable{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                NEXT_PUBLIC_GRAFANA_URL
              </code>{" "}
              in Portainer auf die Grafana-Adresse (z. B.{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                http://192.168.178.101:3001
              </code>
              ).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
