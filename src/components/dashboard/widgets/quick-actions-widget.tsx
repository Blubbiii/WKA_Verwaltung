"use client";

import Link from "next/link";
import { Wind, Users, FileWarning, Zap, FileText, Vote, FolderOpen, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPES
// =============================================================================

interface QuickAction {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  color?: string;
}

interface QuickActionsWidgetProps {
  className?: string;
}

// =============================================================================
// DEFAULT QUICK ACTIONS
// =============================================================================

const DEFAULT_QUICK_ACTIONS: QuickAction[] = [
  {
    id: "new-park",
    label: "Windpark",
    href: "/parks/new",
    icon: <Wind className="h-4 w-4" />,
    color: "text-primary",
  },
  {
    id: "shareholders",
    label: "Gesellschafter",
    href: "/funds",
    icon: <Users className="h-4 w-4" />,
    color: "text-primary",
  },
  {
    id: "new-contract",
    label: "Vertrag",
    href: "/contracts/new",
    icon: <FileWarning className="h-4 w-4" />,
    color: "text-primary",
  },
  {
    id: "new-invoice",
    label: "Rechnung",
    href: "/invoices/new",
    icon: <Zap className="h-4 w-4" />,
    color: "text-primary",
  },
  {
    id: "documents",
    label: "Dokumente",
    href: "/documents",
    icon: <FolderOpen className="h-4 w-4" />,
    color: "text-primary",
  },
  {
    id: "new-vote",
    label: "Abstimmung",
    href: "/votes/new",
    icon: <Vote className="h-4 w-4" />,
    color: "text-primary",
  },
  {
    id: "reports",
    label: "Berichte",
    href: "/reports",
    icon: <FileText className="h-4 w-4" />,
    color: "text-primary",
  },
  {
    id: "upload",
    label: "Upload",
    href: "/documents/upload",
    icon: <Plus className="h-4 w-4" />,
    color: "text-primary",
  },
];

// =============================================================================
// QUICK ACTIONS WIDGET
// =============================================================================

export function QuickActionsWidget({ className }: QuickActionsWidgetProps) {
  return (
    <div className={cn("flex flex-wrap gap-1.5 content-start", className)}>
      {DEFAULT_QUICK_ACTIONS.map((action) => (
        <Link key={action.id} href={action.href}>
          <button
            type="button"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium hover:bg-accent transition-colors"
          >
            <span className={action.color}>{action.icon}</span>
            {action.label}
          </button>
        </Link>
      ))}
    </div>
  );
}

// =============================================================================
// COMPACT VERSION
// =============================================================================

export function QuickActionsWidgetCompact({ className }: QuickActionsWidgetProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {DEFAULT_QUICK_ACTIONS.slice(0, 4).map((action) => (
        <Link key={action.id} href={action.href}>
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-2 rounded-lg border hover:bg-accent transition-colors"
          >
            <span className={cn("h-4 w-4", action.color)}>{action.icon}</span>
            <span className="text-sm font-medium">{action.label}</span>
          </button>
        </Link>
      ))}
    </div>
  );
}
