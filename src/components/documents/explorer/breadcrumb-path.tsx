"use client";

import { useTranslations } from "next-intl";
import { ChevronRight, FolderClosed } from "lucide-react";
import type { FolderPath } from "@/types/document-explorer";

interface BreadcrumbPathProps {
  path: FolderPath | null;
  onNavigate: (level: "root" | "park" | "year") => void;
}

export function BreadcrumbPath({ path, onNavigate }: BreadcrumbPathProps) {
  const t = useTranslations("documents.explorer");
  if (!path) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground px-1 py-2">
        <FolderClosed className="h-4 w-4" />
        <span>{t("selectFolder")}</span>
      </div>
    );
  }

  return (
    <nav className="flex items-center gap-1 text-sm px-1 py-2" aria-label={t("folderPath")}>
      <button
        onClick={() => onNavigate("root")}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        {t("documentsRoot")}
      </button>

      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

      <button
        onClick={() => onNavigate("park")}
        className="text-muted-foreground hover:text-foreground transition-colors truncate max-w-[200px]"
      >
        {path.parkName}
      </button>

      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

      <button
        onClick={() => onNavigate("year")}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        {path.year}
      </button>

      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

      <span className="font-medium text-foreground truncate">{path.categoryLabel}</span>
    </nav>
  );
}
