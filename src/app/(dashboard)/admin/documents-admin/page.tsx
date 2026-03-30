"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Layout, Archive } from "lucide-react";

// Lazy-loaded tab content
const TemplatesContent = dynamic(() => import("./tabs/templates"), { ssr: false });
const ArchiveContent = dynamic(() => import("./tabs/archive"), { ssr: false });

function LoadingSkeleton() {
  return (
    <div className="space-y-2 pt-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function DocumentsAdminPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get("tab") || "vorlagen";

  const setTab = (value: string) => {
    router.replace(`/admin/documents-admin?tab=${value}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dokumente & Vorlagen"
        description="Dokumentvorlagen, Briefpapier und GoBD-Archiv"
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="vorlagen" className="flex items-center gap-2">
            <Layout className="h-4 w-4" />
            Vorlagen & Briefpapier
          </TabsTrigger>
          <TabsTrigger value="archiv" className="flex items-center gap-2">
            <Archive className="h-4 w-4" />
            GoBD-Archiv
          </TabsTrigger>
        </TabsList>
        <TabsContent value="vorlagen">
          <Suspense fallback={<LoadingSkeleton />}><TemplatesContent /></Suspense>
        </TabsContent>
        <TabsContent value="archiv">
          <Suspense fallback={<LoadingSkeleton />}><ArchiveContent /></Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function DocumentsAdminPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <DocumentsAdminPageInner />
    </Suspense>
  );
}
