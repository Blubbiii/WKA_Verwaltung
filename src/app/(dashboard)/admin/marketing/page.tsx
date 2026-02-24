"use client";

import { useSession } from "next-auth/react";
import { MarketingSettings } from "@/components/admin/marketing-settings";
import { AlertTriangle } from "lucide-react";

export default function AdminMarketingPage() {
  const { data: session } = useSession();

  if (session?.user?.role !== "SUPERADMIN") {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground gap-2">
        <AlertTriangle className="h-8 w-8" />
        <p>Nur SuperAdmins können Marketing-Einstellungen verwalten.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Marketing-Einstellungen
        </h1>
        <p className="text-muted-foreground">
          Landingpage-Inhalte, Preiskalkulator und rechtliche Texte verwalten
        </p>
      </div>

      <MarketingSettings />
    </div>
  );
}
