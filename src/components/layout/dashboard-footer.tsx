"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

const appVersion = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";

export function DashboardFooter() {
  const t = useTranslations("footer");

  return (
    <footer className="mt-auto border-t border-border/50 px-6 py-3">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="font-mono">v{appVersion}</span>
          <span className="hidden sm:inline">·</span>
          <span>© {new Date().getFullYear()} WindparkManager. {t("allRightsReserved")}</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/impressum" className="hover:text-foreground transition-colors">
            {t("impressum")}
          </Link>
          <Link href="/datenschutz" className="hover:text-foreground transition-colors">
            {t("datenschutz")}
          </Link>
          <Link href="/cookies" className="hover:text-foreground transition-colors">
            {t("cookies")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
