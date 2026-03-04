"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight, Home } from "lucide-react";

// Known path segments that have i18n keys in breadcrumb.path.*
const KNOWN_SEGMENTS = new Set([
  "dashboard", "parks", "funds", "leases", "contracts", "documents",
  "invoices", "votes", "reports", "settings", "admin", "news",
  "service-events", "energy", "settlements", "productions", "import",
  "new", "edit", "upload", "portal",
]);

// Sections that have detail pages (id-based routes)
const detailSections = [
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

  // Don't show breadcrumb on portal pages or login
  if (pathname.startsWith("/portal") || pathname === "/login") {
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
      // Try i18n key first, then fallback to capitalized segment
      const label = KNOWN_SEGMENTS.has(segment)
        ? tBc(`path.${segment}` as Parameters<typeof tBc>[0])
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

        {items.map((item, index) => (
          <li key={item.href} className="flex items-center gap-1">
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
            {item.isCurrentPage ? (
              <span className="font-medium text-foreground">{item.label}</span>
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
