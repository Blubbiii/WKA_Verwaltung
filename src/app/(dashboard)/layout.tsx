import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { DashboardFooter } from "@/components/layout/dashboard-footer";
import { MaintenanceBanner } from "@/components/layout/maintenance-banner";
import { KeyboardProvider } from "@/components/providers/keyboard-provider";
import { OnboardingProvider } from "@/components/providers/onboarding-provider";
import { OfflineIndicator } from "@/components/providers/offline-indicator";
import { PageTransition } from "@/components/providers/page-transition";
import { CommandPalette } from "@/components/ui/command-palette";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <KeyboardProvider>
      <OnboardingProvider>
        <div className="flex h-screen overflow-hidden">
          <OfflineIndicator />
          <CommandPalette />
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <MaintenanceBanner />
            <Header />
            <main className="flex-1 overflow-y-auto overscroll-contain bg-muted/30 p-6 flex flex-col">
              <Breadcrumb />
              <div className="flex-1">
                <PageTransition>
                  {children}
                </PageTransition>
              </div>
              <DashboardFooter />
            </main>
          </div>
        </div>
      </OnboardingProvider>
    </KeyboardProvider>
  );
}
