"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { modulAusVariante, MODUL_AKTIVIEREN_HREF } from "@/lib/features/modul-aus";

/**
 * Shown instead of a page whose module is switched off. Tells the viewer who
 * can switch it on — and gives the superadmin the way there.
 */
export function ModulAus({ icon: Icon, titel }: { icon: LucideIcon; titel: string }) {
  const t = useTranslations("common.modulAus");
  const { data: session } = useSession();
  const variante = modulAusVariante(session?.user?.roleHierarchy);

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Icon className="h-12 w-12 text-muted-foreground mb-4" aria-hidden="true" />
      <h2 className="text-lg font-semibold">{titel}</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">{t(variante)}</p>
      {variante === "aktivieren" && (
        <Button asChild className="mt-4">
          <Link href={MODUL_AKTIVIEREN_HREF}>{t("aktivierenButton")}</Link>
        </Button>
      )}
    </div>
  );
}
