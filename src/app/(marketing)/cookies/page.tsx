import { prisma } from "@/lib/prisma";
import type { LegalPages } from "@/lib/marketing/types";
import type { Metadata } from "next";
import { SafeHtml } from "@/components/ui/safe-html";
import { DEFAULT_LEGAL_PAGES } from "@/lib/marketing/defaults";

export const metadata: Metadata = {
  title: "Cookie-Einstellungen -- WindparkManager",
  description: "Cookie-Richtlinie und Einstellungen von WindparkManager.",
};

export default async function CookiesPage() {
  // Load legal page content from tenant settings
  const tenant = await prisma.tenant.findFirst({
    where: { status: "ACTIVE" },
    select: { settings: true },
  });
  const settings = (tenant?.settings as Record<string, unknown>) || {};
  const legalPages = settings.legalPages as LegalPages | undefined;
  const cookiesContent = legalPages?.cookies || DEFAULT_LEGAL_PAGES.cookies;

  return (
    <div className="container mx-auto px-4 md:px-6 py-12 md:py-24">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tighter md:text-4xl mb-8">
          Cookie-Einstellungen
        </h1>

        <SafeHtml
          html={cookiesContent}
          className="prose prose-gray dark:prose-invert max-w-none"
        />
      </div>
    </div>
  );
}
