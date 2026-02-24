"use client";

import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { RevenueTypesSettings } from "@/components/settings/RevenueTypesSettings";
import { AlertTriangle } from "lucide-react";

export default function AdminRevenueTypesPage() {
  const { data: session } = useSession();

  if (session?.user?.role !== "SUPERADMIN") {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground gap-2">
        <AlertTriangle className="h-8 w-8" />
        <p>Nur SuperAdmins können Vergütungsarten verwalten.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vergütungsarten"
        description="Vergütungsarten für Energieabrechnungen verwalten"
      />
      <Card>
        <CardContent className="pt-6">
          <RevenueTypesSettings />
        </CardContent>
      </Card>
    </div>
  );
}
