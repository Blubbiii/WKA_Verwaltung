"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight, Home } from "lucide-react";
import { hatEigeneSeite, navTitelKey } from "./brotkrumen-ziele";

// Sections that have detail pages (id-based routes)
const _detailSections = [
  "parks",
  "funds",
  "leases",
  "contracts",
  "documents",
  "invoices",
  "votes",
  "service-events",
  "settlements",
  "productions",
];

interface BreadcrumbItem {
  label: string;
  href: string;
  isCurrentPage: boolean;
}

export function Breadcrumb() {
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const tBc = useTranslations("breadcrumb");

  // Don't show breadcrumb on portal pages, login, or fullscreen pages
  if (pathname.startsWith("/portal") || pathname === "/login" || pathname === "/gis") {
    return null;
  }

  // Skip dashboard-only path
  if (pathname === "/" || pathname === "/dashboard") {
    return null;
  }

  const segments = pathname.split("/").filter(Boolean);

  // Build breadcrumb items
  const items: BreadcrumbItem[] = [];
  let currentPath = "";

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    currentPath += `/${segment}`;

    // Skip (dashboard) group segment
    if (segment.startsWith("(")) continue;

    // Check if this is a UUID (detail page ID)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment);

    if (isUuid) {
      items.push({
        label: tBc("details"),
        href: currentPath,
        isCurrentPage: i === segments.length - 1,
      });
    } else {
      // Sidebar title for this exact path first (what the user knows the page
      // as), then the segment key, and only then the raw segment.
      // brotkrumen-ziele.test.ts fails if any page segment would fall through.
      const navKey = navTitelKey(currentPath);
      const pfadKey = `path.${segment}` as Parameters<typeof tBc>[0];
      const label = navKey
        ? tNav(navKey as Parameters<typeof tNav>[0])
        : tBc.has(pfadKey)
          ? tBc(pfadKey)
          : segment.charAt(0).toUpperCase() + segment.slice(1);

      items.push({
        label,
        href: currentPath,
        isCurrentPage: i === segments.length - 1,
      });
    }
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-1 text-sm text-muted-foreground">
        {/* Home link */}
        <li>
          <Link
            href="/"
            className="flex items-center hover:text-foreground transition-colors"
            title={tNav("dashboard")}
          >
            <Home className="h-4 w-4" />
          </Link>
        </li>

        {items.map((item, _index) => (
          <li key={item.href} className="flex items-center gap-1">
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
            {item.isCurrentPage ? (
              <span className="font-medium text-foreground">{item.label}</span>
            ) : !hatEigeneSeite(item.href) ? (
              <span>{item.label}</span>
            ) : (
              <Link
                href={item.href}
                className="hover:text-foreground transition-colors"
              >
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
