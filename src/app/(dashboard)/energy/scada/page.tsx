"use client";

import { Radio } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ScadaMappingsTab from "@/components/energy/scada/ScadaMappingsTab";
import ScadaImportTab from "@/components/energy/scada/ScadaImportTab";
import ScadaAutoImportTab from "@/components/energy/scada/ScadaAutoImportTab";
import ScadaLogsTab from "@/components/energy/scada/ScadaLogsTab";

export default function ScadaPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Radio className="h-6 w-6" />
            SCADA-Import & Verwaltung
          </h1>
          <p className="text-muted-foreground">
            Import und Zuordnung der Enercon SCADA-Messdaten (DBF/WSD/UID)
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="mappings">
        <TabsList>
          <TabsTrigger value="mappings">Zuordnungen</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="auto-import">Auto-Import</TabsTrigger>
          <TabsTrigger value="logs">Protokolle</TabsTrigger>
        </TabsList>
        <TabsContent value="mappings" className="mt-4">
          <ScadaMappingsTab />
        </TabsContent>
        <TabsContent value="import" className="mt-4">
          <ScadaImportTab />
        </TabsContent>
        <TabsContent value="auto-import" className="mt-4">
          <ScadaAutoImportTab />
        </TabsContent>
        <TabsContent value="logs" className="mt-4">
          <ScadaLogsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
