import type { Metadata } from "next";
import { TenantOnboardingWizard } from "@/components/admin/tenant-onboarding-wizard";

export const metadata: Metadata = {
  title: "Einrichtung - WindparkManager",
};

export default function SetupPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Willkommen bei WindparkManager
        </h1>
        <p className="text-muted-foreground">
          Richten Sie Ihren Mandanten in wenigen Schritten ein.
        </p>
      </div>
      <TenantOnboardingWizard />
    </div>
  );
}
