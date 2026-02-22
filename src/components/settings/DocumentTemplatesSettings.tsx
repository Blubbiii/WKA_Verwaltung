"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  FileText,
  Check,
  Star,
} from "lucide-react";
import {
  useDocumentTemplates,
  createDocumentTemplate,
  updateDocumentTemplate,
  deleteDocumentTemplate,
  documentTypeLabels,
  type DocumentType,
  type DocumentTemplate,
} from "@/hooks/useDocumentTemplates";
import { DEFAULT_DOCUMENT_LAYOUT } from "@/types/pdf";

interface TemplateFormData {
  name: string;
  documentType: DocumentType;
  footerText: string;
  isDefault: boolean;
  // Layout-Optionen
  showLogo: boolean;
  showCompanyName: boolean;
  showPosition: boolean;
  showQuantity: boolean;
  showUnit: boolean;
  showTaxRate: boolean;
  showBankDetails: boolean;
  showTaxDisclaimer: boolean;
}

const defaultFormData: TemplateFormData = {
  name: "",
  documentType: "INVOICE",
  footerText: "",
  isDefault: false,
  showLogo: true,
  showCompanyName: true,
  showPosition: true,
  showQuantity: true,
  showUnit: true,
  showTaxRate: true,
  showBankDetails: true,
  showTaxDisclaimer: true,
};

function TemplateList({
  documentType,
  templates,
  isLoading,
  onEdit,
  onDelete,
  onSetDefault,
}: {
  documentType: DocumentType;
  templates: DocumentTemplate[];
  isLoading: boolean;
  onEdit: (template: DocumentTemplate) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}) {
  const filtered = templates.filter((t) => t.documentType === documentType);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Keine Vorlagen vorhanden
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Windpark</TableHead>
          <TableHead>Standard</TableHead>
          <TableHead className="w-[100px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filtered.map((template) => (
          <TableRow key={template.id}>
            <TableCell className="font-medium">{template.name}</TableCell>
            <TableCell>
              {template.park ? (
                <Badge variant="outline">{template.park.name}</Badge>
              ) : (
                <span className="text-muted-foreground">Alle</span>
              )}
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
                  onClick={() => onSetDefault(template.id)}
                >
                  Als Standard
                </Button>
              )}
            </TableCell>
            <TableCell>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(template)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(template.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function DocumentTemplatesSettings() {
  const { templates, isLoading, isError, mutate } = useDocumentTemplates();
  const [showDialog, setShowDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null);
  const [formData, setFormData] = useState<TemplateFormData>(defaultFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);

  const templateList = Array.isArray(templates) ? templates : [];

  function openCreateDialog(documentType: DocumentType) {
    setEditingTemplate(null);
    setFormData({ ...defaultFormData, documentType });
    setShowDialog(true);
  }

  function openEditDialog(template: DocumentTemplate) {
    setEditingTemplate(template);
    const layout = template.layout || DEFAULT_DOCUMENT_LAYOUT;
    setFormData({
      name: template.name,
      documentType: template.documentType,
      footerText: template.footerText || "",
      isDefault: template.isDefault,
      showLogo: layout.sections?.header?.showLogo ?? true,
      showCompanyName: layout.sections?.header?.showCompanyName ?? true,
      showPosition: layout.sections?.items?.showPosition ?? true,
      showQuantity: layout.sections?.items?.showQuantity ?? true,
      showUnit: layout.sections?.items?.showUnit ?? true,
      showTaxRate: layout.sections?.items?.showTaxRate ?? true,
      showBankDetails: layout.sections?.footer?.showBankDetails ?? true,
      showTaxDisclaimer: layout.sections?.footer?.showTaxDisclaimer ?? true,
    });
    setShowDialog(true);
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      toast.error("Name erforderlich");
      return;
    }

    try {
      setIsSaving(true);

      const layout = {
        ...DEFAULT_DOCUMENT_LAYOUT,
        sections: {
          ...DEFAULT_DOCUMENT_LAYOUT.sections,
          header: {
            ...DEFAULT_DOCUMENT_LAYOUT.sections.header,
            showLogo: formData.showLogo,
            showCompanyName: formData.showCompanyName,
          },
          items: {
            ...DEFAULT_DOCUMENT_LAYOUT.sections.items,
            showPosition: formData.showPosition,
            showQuantity: formData.showQuantity,
            showUnit: formData.showUnit,
            showTaxRate: formData.showTaxRate,
          },
          footer: {
            ...DEFAULT_DOCUMENT_LAYOUT.sections.footer,
            showBankDetails: formData.showBankDetails,
            showTaxDisclaimer: formData.showTaxDisclaimer,
          },
        },
      };

      if (editingTemplate) {
        await updateDocumentTemplate(editingTemplate.id, {
          name: formData.name,
          layout,
          footerText: formData.footerText || null,
          isDefault: formData.isDefault,
        });
        toast.success("Vorlage aktualisiert");
      } else {
        await createDocumentTemplate({
          name: formData.name,
          documentType: formData.documentType,
          layout,
          footerText: formData.footerText || undefined,
          isDefault: formData.isDefault,
        });
        toast.success("Vorlage erstellt");
      }

      setShowDialog(false);
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Speichern");
    } finally {
      setIsSaving(false);
    }
  }

  function handleDelete(id: string) {
    setTemplateToDelete(id);
    setDeleteDialogOpen(true);
  }

  async function handleConfirmDelete() {
    if (!templateToDelete) return;

    try {
      await deleteDocumentTemplate(templateToDelete);
      toast.success("Vorlage geloescht");
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Loeschen");
    } finally {
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
    }
  }

  async function handleSetDefault(id: string) {
    try {
      await updateDocumentTemplate(id, { isDefault: true });
      toast.success("Standard-Vorlage gesetzt");
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler");
    }
  }

  if (isError) {
    return (
      <div className="p-4 text-red-600 bg-red-50 rounded-md">
        Fehler beim Laden der Dokumentvorlagen
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Dokumentvorlagen
          </CardTitle>
          <CardDescription>
            Konfigurieren Sie das Aussehen Ihrer Rechnungen, Gutschriften und anderen Dokumente
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="INVOICE">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="INVOICE">Rechnungen</TabsTrigger>
              <TabsTrigger value="CREDIT_NOTE">Gutschriften</TabsTrigger>
              <TabsTrigger value="CONTRACT">Vertraege</TabsTrigger>
              <TabsTrigger value="SETTLEMENT_REPORT">Abrechnungen</TabsTrigger>
            </TabsList>

            {(["INVOICE", "CREDIT_NOTE", "CONTRACT", "SETTLEMENT_REPORT"] as DocumentType[]).map(
              (type) => (
                <TabsContent key={type} value={type} className="space-y-4">
                  <div className="flex justify-end">
                    <Button onClick={() => openCreateDialog(type)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Neue Vorlage
                    </Button>
                  </div>
                  <TemplateList
                    documentType={type}
                    templates={templateList}
                    isLoading={isLoading}
                    onEdit={openEditDialog}
                    onDelete={handleDelete}
                    onSetDefault={handleSetDefault}
                  />
                </TabsContent>
              )
            )}
          </Tabs>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Vorlage bearbeiten" : "Neue Vorlage erstellen"}
            </DialogTitle>
            <DialogDescription>
              {documentTypeLabels[formData.documentType]}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Grundeinstellungen */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="z.B. Standard Rechnung"
                />
              </div>
              <div className="flex items-center space-x-2 pt-6">
                <Switch
                  id="isDefault"
                  checked={formData.isDefault}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, isDefault: checked })
                  }
                />
                <Label htmlFor="isDefault">Als Standard verwenden</Label>
              </div>
            </div>

            {/* Layout-Optionen */}
            <div className="space-y-4">
              <h4 className="font-medium">Layout-Optionen</h4>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-3">
                  <Label className="text-sm text-muted-foreground">Kopfbereich</Label>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="showLogo"
                        checked={formData.showLogo}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, showLogo: checked })
                        }
                      />
                      <Label htmlFor="showLogo">Logo anzeigen</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="showCompanyName"
                        checked={formData.showCompanyName}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, showCompanyName: checked })
                        }
                      />
                      <Label htmlFor="showCompanyName">Firmenname anzeigen</Label>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm text-muted-foreground">Positionen</Label>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="showPosition"
                        checked={formData.showPosition}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, showPosition: checked })
                        }
                      />
                      <Label htmlFor="showPosition">Position anzeigen</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="showQuantity"
                        checked={formData.showQuantity}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, showQuantity: checked })
                        }
                      />
                      <Label htmlFor="showQuantity">Menge anzeigen</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="showUnit"
                        checked={formData.showUnit}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, showUnit: checked })
                        }
                      />
                      <Label htmlFor="showUnit">Einheit anzeigen</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="showTaxRate"
                        checked={formData.showTaxRate}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, showTaxRate: checked })
                        }
                      />
                      <Label htmlFor="showTaxRate">Steuersatz anzeigen</Label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label className="text-sm text-muted-foreground">Fussbereich</Label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="showBankDetails"
                      checked={formData.showBankDetails}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, showBankDetails: checked })
                      }
                    />
                    <Label htmlFor="showBankDetails">Bankverbindung anzeigen</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="showTaxDisclaimer"
                      checked={formData.showTaxDisclaimer}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, showTaxDisclaimer: checked })
                      }
                    />
                    <Label htmlFor="showTaxDisclaimer">Steuerhinweis anzeigen</Label>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer-Text */}
            <div className="space-y-2">
              <Label htmlFor="footerText">Zusaetzlicher Fusszeilen-Text</Label>
              <Textarea
                id="footerText"
                value={formData.footerText}
                onChange={(e) => setFormData({ ...formData, footerText: e.target.value })}
                placeholder="z.B. Zahlungsbedingungen, rechtliche Hinweise..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleConfirmDelete}
        title="Vorlage loeschen"
        description="Moechten Sie diese Dokumentvorlage wirklich loeschen?"
      />
    </div>
  );
}
