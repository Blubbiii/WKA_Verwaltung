import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Activity } from "lucide-react";
import { MonitoringDashboard } from "@/components/admin/monitoring-dashboard";

export default async function MonitoringPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex flex-col h-full gap-4 p-6">
      {/* Header */}
      <div className="flex items-center gap-2 shrink-0">
        <Activity className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Monitoring</h1>
      </div>

      {/* Native Monitoring Dashboard */}
      <MonitoringDashboard />
    </div>
  );
}
