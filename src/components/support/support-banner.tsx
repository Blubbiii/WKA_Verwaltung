"use client";

/**
 * Banner while the platform operator works in a customer's tenant (2026-09):
 * whose data, until when, and a way out. Nothing is shown otherwise.
 */

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { LifeBuoy, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Status {
  aktiv: boolean;
  mandant?: string;
  art?: "FREIGABE" | "NOTFALL";
  gueltigBis?: string;
}

export function SupportBanner() {
  const t = useTranslations("support");
  const { data } = useQuery({
    queryKey: ["support-status"],
    queryFn: async (): Promise<Status> => {
      const res = await fetch("/api/support/status");
      if (!res.ok) return { aktiv: false };
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  if (!data?.aktiv) return null;

  const verlassen = async () => {
    await fetch("/api/user/switch-tenant", { method: "DELETE" });
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- leaving a tenant swaps all data: full reload
    window.location.href = "/admin/tenants";
  };

  const bis = new Date(data.gueltigBis!).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });

  return (
    <div
      role="status"
      className="flex items-center justify-between gap-3 px-4 py-2 bg-orange-600 text-white text-sm"
    >
      <div className="flex items-center gap-2">
        <LifeBuoy className="h-4 w-4 shrink-0" />
        <span>
          {t(data.art === "NOTFALL" ? "bannerNotfall" : "banner", { mandant: data.mandant ?? "", bis })}
        </span>
      </div>
      <Button variant="ghost" size="sm" className="text-white hover:bg-orange-700" onClick={verlassen}>
        <LogOut className="h-4 w-4 mr-1" />
        {t("verlassen")}
      </Button>
    </div>
  );
}
