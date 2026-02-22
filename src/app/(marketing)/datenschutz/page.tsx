import { prisma } from "@/lib/prisma";
import type { LegalPages } from "@/lib/marketing/types";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Datenschutz -- WindparkManager",
  description: "Datenschutzerklaerung von WindparkManager.",
};

export default async function DatenschutzPage() {
  // Load legal page content from tenant settings
  const tenant = await prisma.tenant.findFirst({
    where: { status: "ACTIVE" },
    select: { settings: true },
  });
  const settings = (tenant?.settings as Record<string, unknown>) || {};
  const legalPages = settings.legalPages as LegalPages | undefined;
  const datenschutzContent = legalPages?.datenschutz;

  return (
    <div className="container mx-auto px-4 md:px-6 py-12 md:py-24">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tighter md:text-4xl mb-8">
          Datenschutzerklaerung
        </h1>

        {datenschutzContent ? (
          <div
            className="prose prose-gray dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: datenschutzContent }}
          />
        ) : (
          <div className="rounded-lg border bg-card p-8 text-center">
            <p className="text-muted-foreground">
              Datenschutzerklaerung wird in Kuerze bereitgestellt.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
