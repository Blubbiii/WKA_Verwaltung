import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ExternalLink, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnalyticsDashboard } from "@/components/admin/analytics-dashboard";

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
              Metabase öffnen
            </a>
          </Button>
        )}
      </div>

      {/* Native Analytics Dashboard */}
      <AnalyticsDashboard />
    </div>
  );
}
