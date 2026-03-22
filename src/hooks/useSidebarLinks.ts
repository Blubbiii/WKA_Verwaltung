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
      .then((r) => (r.ok ? r.json() : []))
      .then(setLinks)
      .catch(() => {});
  }, []);

  return links;
}
