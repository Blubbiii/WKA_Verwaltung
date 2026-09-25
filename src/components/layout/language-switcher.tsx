"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe, Check } from "lucide-react";
import { locales, localeLabels, type Locale } from "@/i18n/config";

/** Language choice as a submenu of the user menu. */
export function SpracheUntermenue() {
  const [isPending, startTransition] = useTransition();
  const currentLocale = useLocale();
  const t = useTranslations("header");

  const switchLocale = (locale: Locale) => {
    if (locale === currentLocale) return;
    startTransition(() => {
      document.cookie = `locale=${locale};path=/;max-age=31536000;SameSite=Lax`;
      window.location.reload();
    });
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={isPending}>
        <Globe className="mr-2 h-4 w-4" />
        {t("language")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {locales.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => switchLocale(locale)}
            className="cursor-pointer"
          >
            <span className="flex-1">{localeLabels[locale]}</span>
            {locale === currentLocale && <Check className="ml-2 h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
