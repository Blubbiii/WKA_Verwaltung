import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { MaintenanceBanner } from "@/components/layout/maintenance-banner";
import { KeyboardProvider } from "@/components/providers/keyboard-provider";
import { OnboardingProvider } from "@/components/providers/onboarding-provider";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <KeyboardProvider>
      <OnboardingProvider>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <MaintenanceBanner />
            <Header />
            <main className="flex-1 overflow-y-auto overscroll-contain bg-muted/30 p-6">
              <Breadcrumb />
              <div className="animate-fade-in">
                {children}
              </div>
            </main>
          </div>
        </div>
      </OnboardingProvider>
    </KeyboardProvider>
  );
}
