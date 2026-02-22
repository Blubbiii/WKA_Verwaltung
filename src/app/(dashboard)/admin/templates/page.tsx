"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentTemplatesSettings } from "@/components/settings/DocumentTemplatesSettings";
import { LetterheadSettings } from "@/components/settings/LetterheadSettings";
import { Layout, ImageIcon } from "lucide-react";

export default function AdminTemplatesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Vorlagen</h1>
        <p className="text-muted-foreground">
          Dokumentvorlagen und Briefpapier verwalten
        </p>
      </div>

      <Tabs defaultValue="documents" className="space-y-4">
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
    </div>
  );
}
