import { Sidebar } from "@/components/layout/sidebar";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
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
        {/* Skip link — first focusable element for keyboard/screen-reader users (WCAG 2.4.1, BFSG) */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          Zum Hauptinhalt springen
        </a>
        <div className="flex h-screen overflow-hidden">
          <OfflineIndicator />
          <CommandPalette />
          {/* Desktop sidebar */}
          <div className="hidden md:block">
            <Sidebar />
          </div>
          {/* Mobile sidebar (Sheet drawer) */}
          <MobileSidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <MaintenanceBanner />
            <Header />
            <main
              id="main-content"
              tabIndex={-1}
              className="flex-1 overflow-y-auto overscroll-contain bg-muted/30 p-3 sm:p-4 md:p-6 flex flex-col"
            >
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
