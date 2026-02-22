"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvoiceSequencesSettings } from "@/components/settings/InvoiceSequencesSettings";
import { TenantInvoiceSettings } from "@/components/settings/TenantInvoiceSettings";
import { InvoiceTemplateSettings } from "@/components/settings/InvoiceTemplateSettings";
import { PositionTemplatesSettings } from "@/components/settings/PositionTemplatesSettings";
import { FileText, Receipt, PenTool, List } from "lucide-react";

export default function AdminInvoiceSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Rechnungseinstellungen</h1>
        <p className="text-muted-foreground">
          Nummernkreise, Rechnungsvorlagen und Positionsvorlagen verwalten
        </p>
      </div>

      <Tabs defaultValue="sequences" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sequences" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Nummernkreise
          </TabsTrigger>
          <TabsTrigger value="billing" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Rechnungen
          </TabsTrigger>
          <TabsTrigger value="invoice-templates" className="flex items-center gap-2">
            <PenTool className="h-4 w-4" />
            Rechnungsvorlagen
          </TabsTrigger>
          <TabsTrigger value="positions" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            Positionsvorlagen
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sequences" className="space-y-4">
          <InvoiceSequencesSettings />
        </TabsContent>

        <TabsContent value="billing" className="space-y-4">
          <TenantInvoiceSettings />
        </TabsContent>

        <TabsContent value="invoice-templates" className="space-y-4">
          <InvoiceTemplateSettings />
        </TabsContent>

        <TabsContent value="positions" className="space-y-4">
          <PositionTemplatesSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
