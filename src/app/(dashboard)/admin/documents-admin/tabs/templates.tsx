"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentTemplatesSettings } from "@/components/settings/DocumentTemplatesSettings";
import { LetterheadSettings } from "@/components/settings/LetterheadSettings";
import { Layout, ImageIcon } from "lucide-react";
import { useTabParam } from "@/hooks/useTabParam";

/** Bedienaufwand #15: erlaubte Werte fuer ?subtab= — alles andere faellt auf den Standard zurueck. */
const SUBTAB_VALUES = ["documents", "letterhead"] as const;

export default function TemplatesTab() {
  const [activeTab, setActiveTab] = useTabParam("documents", { allowed: SUBTAB_VALUES, paramName: "subtab" });
  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="documents" className="flex items-center gap-2">
          <Layout className="h-4 w-4" />
          Dokumentvorlagen
        </TabsTrigger>
        <TabsTrigger value="letterhead" className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4" />
          Briefpapier
        </TabsTrigger>
      </TabsList>

      <TabsContent value="documents" className="space-y-4">
        <DocumentTemplatesSettings />
      </TabsContent>

      <TabsContent value="letterhead" className="space-y-4">
        <LetterheadSettings />
      </TabsContent>
    </Tabs>
  );
}
