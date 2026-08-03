"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FavoriteStar } from "@/components/layout/favorite-star";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface PageHeaderProps {
  title: string;
  description?: string;
  createHref?: string;
  createLabel?: string;
  actions?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  createHref,
  createLabel,
  actions,
}: PageHeaderProps) {
  const t = useTranslations("common.pageHeader");
  // Ohne Fragezeichen und Anker: der Favorit soll die Seite treffen, nicht
  // einen bestimmten Filterzustand darauf.
  const pathname = usePathname();
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {/*
            Der Stern steht neben der Ueberschrift, weil dort die Entscheidung
            faellt: man denkt "das brauche ich oft", WAEHREND man auf der Seite
            ist. Eine Favoritenverwaltung, die man erst aufsuchen muss, fuellt
            fast niemand.
          */}
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">{title}</h1>
            <FavoriteStar href={pathname} />
          </div>
          {description && (
            <p className="text-muted-foreground mt-1 text-sm">{description}</p>
          )}
        </div>
        {(actions || createHref) && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {actions}
            {createHref && (
              <Button asChild>
                <Link href={createHref}>
                  <Plus className="mr-2 h-4 w-4" />
                  {createLabel || t("create")}
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="h-px bg-gradient-to-r from-primary/40 via-border/50 to-transparent" />
    </div>
  );
}
