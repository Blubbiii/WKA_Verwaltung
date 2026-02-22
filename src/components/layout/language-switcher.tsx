"use client";

import { useTransition, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe, Check } from "lucide-react";
import { locales, localeLabels, type Locale } from "@/i18n/config";

export function LanguageSwitcher() {
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const currentLocale = useLocale();
  const t = useTranslations("header");

  useEffect(() => {
    setMounted(true);
  }, []);

  const switchLocale = (locale: Locale) => {
    if (locale === currentLocale) return;
    startTransition(() => {
      document.cookie = `locale=${locale};path=/;max-age=31536000;SameSite=Lax`;
      window.location.reload();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={isPending}
          title={t("language")}
          aria-label={t("language")}
        >
          {mounted ? (
            <Globe className="h-5 w-5" />
          ) : (
            <div className="h-5 w-5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {locales.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => switchLocale(locale)}
            className="cursor-pointer"
          >
            <span className="flex-1">{localeLabels[locale]}</span>
            {locale === currentLocale && (
              <Check className="ml-2 h-4 w-4" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
