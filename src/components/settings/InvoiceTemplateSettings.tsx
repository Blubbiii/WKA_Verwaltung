"use client";

// Invoice Template Settings - manages the list of WYSIWYG invoice templates
// Integrates with the admin settings page as a tab

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  Plus,
  Pencil,
  Trash2,
  Star,
  FileText,
  Copy,
} from "lucide-react";
import {
  useInvoiceTemplates,
  createInvoiceTemplate,
  updateInvoiceTemplate,
  deleteInvoiceTemplate,
} from "@/hooks/useInvoiceTemplates";
import { InvoiceTemplateEditor } from "@/components/settings/invoice-template-editor";
import type { TemplateLayout, InvoiceTemplate } from "@/lib/invoice-templates/template-types";

type EditorMode =
  | { type: "list" }
  | { type: "create" }
  | { type: "edit"; templateId: string; template: InvoiceTemplate };

export function InvoiceTemplateSettings() {
  const { templates, isLoading, isError, mutate } = useInvoiceTemplates();
  const [mode, setMode] = useState<EditorMode>({ type: "list" });
  const [isSaving, setIsSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);

  const templateList = Array.isArray(templates) ? templates : [];

  // ----------------------------------------
  // Handlers
  // ----------------------------------------

  async function handleSaveNew(name: string, layout: TemplateLayout) {
    try {
      setIsSaving(true);
      await createInvoiceTemplate({ name, layout, isDefault: templateList.length === 0 });
      toast.success("Rechnungsvorlage erstellt");
      setMode({ type: "list" });
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Erstellen");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveExisting(name: string, layout: TemplateLayout) {
    if (mode.type !== "edit") return;
    try {
      setIsSaving(true);
      await updateInvoiceTemplate(mode.templateId, { name, layout });
      toast.success("Rechnungsvorlage aktualisiert");
      setMode({ type: "list" });
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Aktualisieren");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSetDefault(id: string) {
    try {
      await updateInvoiceTemplate(id, { isDefault: true });
      toast.success("Standard-Vorlage gesetzt");
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler");
    }
  }

  async function handleDuplicate(template: InvoiceTemplate) {
    try {
      await createInvoiceTemplate({
        name: `${template.name} (Kopie)`,
        layout: template.layout as TemplateLayout,
        isDefault: false,
      });
      toast.success("Vorlage dupliziert");
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Duplizieren");
    }
  }

  function handleDelete(id: string) {
    setTemplateToDelete(id);
    setDeleteDialogOpen(true);
  }

  async function handleConfirmDelete() {
    if (!templateToDelete) return;
    try {
      await deleteInvoiceTemplate(templateToDelete);
      toast.success("Rechnungsvorlage geloescht");
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Loeschen");
    } finally {
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
    }
  }

  // ----------------------------------------
  // Render: Editor Mode
  // ----------------------------------------

  if (mode.type === "create") {
    return (
      <InvoiceTemplateEditor
        onSave={handleSaveNew}
        onBack={() => setMode({ type: "list" })}
        isSaving={isSaving}
      />
    );
  }

  if (mode.type === "edit") {
    return (
      <InvoiceTemplateEditor
        templateId={mode.templateId}
        templateName={mode.template.name}
        initialLayout={mode.template.layout as TemplateLayout}
        onSave={handleSaveExisting}
        onBack={() => setMode({ type: "list" })}
        isSaving={isSaving}
      />
    );
  }

  // ----------------------------------------
  // Render: List Mode
  // ----------------------------------------

  if (isError) {
    return (
      <div className="p-4 text-red-600 bg-red-50 rounded-md">
        Fehler beim Laden der Rechnungsvorlagen
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Rechnungsvorlagen (WYSIWYG)
              </CardTitle>
              <CardDescription>
                Erstellen und bearbeiten Sie Rechnungsvorlagen mit dem visuellen Editor.
                Bausteine koennen per Drag &amp; Drop angeordnet werden.
              </CardDescription>
            </div>
            <Button onClick={() => setMode({ type: "create" })}>
              <Plus className="mr-2 h-4 w-4" />
              Neue Vorlage
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : templateList.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm font-medium">Keine Rechnungsvorlagen vorhanden</p>
              <p className="text-xs mt-1">
                Erstellen Sie Ihre erste Vorlage mit dem visuellen Editor
              </p>
              <Button
                className="mt-4"
                onClick={() => setMode({ type: "create" })}
              >
                <Plus className="mr-2 h-4 w-4" />
                Erste Vorlage erstellen
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Bausteine</TableHead>
                  <TableHead>Seitenformat</TableHead>
                  <TableHead>Standard</TableHead>
                  <TableHead>Geaendert</TableHead>
                  <TableHead className="w-[140px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templateList.map((template) => {
                  const layout = template.layout as TemplateLayout | null;
                  const blockCount = layout?.blocks?.length || 0;
                  const visibleCount = layout?.blocks?.filter((b) => b.visible).length || 0;
                  const updatedAt = new Date(template.updatedAt).toLocaleDateString("de-DE", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  });

                  return (
                    <TableRow key={template.id}>
                      <TableCell className="font-medium">{template.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {visibleCount}/{blockCount} Bausteine
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {layout?.pageSize || "A4"}
                      </TableCell>
                      <TableCell>
                        {template.isDefault ? (
                          <Badge className="bg-green-100 text-green-800">
                            <Star className="h-3 w-3 mr-1" />
                            Standard
                          </Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSetDefault(template.id)}
                          >
                            Als Standard
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {updatedAt}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setMode({
                                type: "edit",
                                templateId: template.id,
                                template,
                              })
                            }
                            title="Bearbeiten"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDuplicate(template)}
                            title="Duplizieren"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(template.id)}
                            title="Loeschen"
                            disabled={template.isDefault}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Rechnungsvorlage loeschen"
        description="Moechten Sie diese Rechnungsvorlage wirklich loeschen? Diese Aktion kann nicht rueckgaengig gemacht werden."
      />
    </div>
  );
}
