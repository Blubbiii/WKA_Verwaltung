import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ExternalLink, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const metabaseUrl = process.env.NEXT_PUBLIC_METABASE_URL;

  return (
    <div className="flex flex-col h-full gap-4 p-6">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Analytics</h1>
        </div>
        {metabaseUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={metabaseUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              In neuem Tab öffnen
            </a>
          </Button>
        )}
      </div>

      {/* iFrame or placeholder */}
      {metabaseUrl ? (
        <div className="flex-1 rounded-lg border overflow-hidden">
          <iframe
            src={metabaseUrl}
            className="w-full h-full border-0"
            title="Metabase Analytics"
            allow="fullscreen"
          />
        </div>
      ) : (
        <div className="flex-1 rounded-lg border border-dashed flex flex-col items-center justify-center gap-4 text-center p-8">
          <BarChart2 className="h-12 w-12 text-muted-foreground/40" />
          <div className="space-y-2 max-w-md">
            <p className="text-lg font-medium">Metabase nicht konfiguriert</p>
            <p className="text-sm text-muted-foreground">
              Starten Sie den Metabase-Dienst im Docker-Stack und setzen Sie
              die Umgebungsvariable{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                NEXT_PUBLIC_METABASE_URL
              </code>{" "}
              in Portainer auf die Metabase-Adresse (z. B.{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                http://192.168.178.101:3002
              </code>
              ). Beim ersten Start die Einrichtung im Browser abschliessen.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
