import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ExternalLink, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isMetabaseConfigured, getMetabaseDashboardUrl } from "@/lib/metabase-embed";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const metabaseUrl = process.env.NEXT_PUBLIC_METABASE_URL;
  const useEmbedding = isMetabaseConfigured();

  // Dashboard ID 1 = default first dashboard in Metabase
  // Change this to the actual dashboard ID you want to embed
  const iframeSrc = useEmbedding
    ? getMetabaseDashboardUrl(1)
    : metabaseUrl;

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
      {iframeSrc ? (
        <div className="flex-1 rounded-lg border overflow-hidden">
          <iframe
            src={iframeSrc}
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
              die Umgebungsvariablen{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                NEXT_PUBLIC_METABASE_URL
              </code>{" "}
              und{" "}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                METABASE_EMBEDDING_SECRET
              </code>{" "}
              in Portainer.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
