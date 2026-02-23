import { prisma } from "@/lib/prisma";
import type { LegalPages } from "@/lib/marketing/types";
import type { Metadata } from "next";
import { SafeHtml } from "@/components/ui/safe-html";

export const metadata: Metadata = {
  title: "Impressum -- WindparkManager",
  description: "Impressum und rechtliche Angaben von WindparkManager.",
};

export default async function ImpressumPage() {
  // Load legal page content from tenant settings
  const tenant = await prisma.tenant.findFirst({
    where: { status: "ACTIVE" },
    select: { settings: true },
  });
  const settings = (tenant?.settings as Record<string, unknown>) || {};
  const legalPages = settings.legalPages as LegalPages | undefined;
  const impressumContent = legalPages?.impressum;

  return (
    <div className="container mx-auto px-4 md:px-6 py-12 md:py-24">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tighter md:text-4xl mb-8">
          Impressum
        </h1>

        {impressumContent ? (
          <SafeHtml
            html={impressumContent}
            className="prose prose-gray dark:prose-invert max-w-none"
          />
        ) : (
          <div className="rounded-lg border bg-card p-8 text-center">
            <p className="text-muted-foreground">
              Impressum wird in Kuerze bereitgestellt.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
