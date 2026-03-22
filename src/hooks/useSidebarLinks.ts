import { useEffect, useState } from "react";

export interface SidebarLinkItem {
  id: string;
  label: string;
  url: string;
  icon: string;
  description: string | null;
  openInNewTab: boolean;
}

export function useSidebarLinks() {
  const [links, setLinks] = useState<SidebarLinkItem[]>([]);

  useEffect(() => {
    fetch("/api/sidebar-links")
      .then((r) => {
        console.log("[sidebar-links] status:", r.status);
        return r.ok ? r.json() : [];
      })
      .then((data) => {
        console.log("[sidebar-links] data:", data);
        setLinks(data);
      })
      .catch((e) => console.error("[sidebar-links] error:", e));
  }, []);

  return links;
}
