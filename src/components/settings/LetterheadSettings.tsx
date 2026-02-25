"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
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
} from "@/components/ui/dialog";
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
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { useFileUpload } from "@/hooks/useFileUpload";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ImageIcon,
  Check,
  Star,
  Upload,
  Eye,
  FileText,
} from "lucide-react";
import {
  useLetterheads,
  createLetterhead,
  updateLetterhead,
  deleteLetterhead,
  type Letterhead,
} from "@/hooks/useLetterheads";

interface LetterheadFormData {
  name: string;
  headerImageUrl: string;
  headerHeight: number;
  logoPosition: string;
  logoWidth: number;
  logoMarginTop: number;
  logoMarginLeft: number;
  senderAddress: string;
  footerImageUrl: string;
  footerHeight: number;
  footerText: string;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  primaryColor: string;
  secondaryColor: string;
  isDefault: boolean;
  backgroundPdfKey: string;
  backgroundPdfName: string;
  fundId: string;
}

const defaultFormData: LetterheadFormData = {
  name: "",
  headerImageUrl: "",
  headerHeight: 100,
  logoPosition: "top-left",
  logoWidth: 50,
  logoMarginTop: 10,
  logoMarginLeft: 10,
  senderAddress: "",
  footerImageUrl: "",
  footerHeight: 25,
  footerText: "",
  marginTop: 45,
  marginBottom: 30,
  marginLeft: 25,
  marginRight: 20,
  primaryColor: "",
  secondaryColor: "",
  isDefault: false,
  backgroundPdfKey: "",
  backgroundPdfName: "",
  fundId: "",
};

export function LetterheadSettings() {
  const { letterheads, isLoading, isError, mutate } = useLetterheads();
  const [showDialog, setShowDialog] = useState(false);
  const [editingLetterhead, setEditingLetterhead] = useState<Letterhead | null>(null);
  const [formData, setFormData] = useState<LetterheadFormData>(defaultFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [letterheadToDelete, setLetterheadToDelete] = useState<string | null>(null);
  const [previewLetterheadId, setPreviewLetterheadId] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [funds, setFunds] = useState<{ id: string; name: string; legalForm: string | null }[]>([]);

  const { upload: uploadWithProgress, isUploading, progress: imageUploadProgress } = useFileUpload();

  useEffect(() => {
    async function loadFunds() {
      try {
        const response = await fetch("/api/funds?limit=200");
        if (response.ok) {
          const data = await response.json();
          const fundList = data.data ?? data;
          setFunds(
            Array.isArray(fundList)
              ? fundList.map((f: { id: string; name: string; legalForm: string | null }) => ({
                  id: f.id,
                  name: f.name,
                  legalForm: f.legalForm,
                }))
              : []
          );
        }
      } catch {
        // Fund loading failed silently
      }
    }
    loadFunds();
  }, []);

  const letterheadList = Array.isArray(letterheads) ? letterheads : [];

  function openCreateDialog() {
    setEditingLetterhead(null);
    setFormData(defaultFormData);
    setShowDialog(true);
  }

  function openEditDialog(letterhead: Letterhead) {
    setEditingLetterhead(letterhead);
    setFormData({
      name: letterhead.name,
      headerImageUrl: letterhead.headerImageUrl || "",
      headerHeight: letterhead.headerHeight || 100,
      logoPosition: letterhead.logoPosition || "top-left",
      logoWidth: letterhead.logoWidth || 50,
      logoMarginTop: letterhead.logoMarginTop || 10,
      logoMarginLeft: letterhead.logoMarginLeft || 10,
      senderAddress: letterhead.senderAddress || "",
      footerImageUrl: letterhead.footerImageUrl || "",
      footerHeight: letterhead.footerHeight || 25,
      footerText: letterhead.footerText || "",
      marginTop: letterhead.marginTop,
      marginBottom: letterhead.marginBottom,
      marginLeft: letterhead.marginLeft,
      marginRight: letterhead.marginRight,
      primaryColor: letterhead.primaryColor || "",
      secondaryColor: letterhead.secondaryColor || "",
      isDefault: letterhead.isDefault,
      backgroundPdfKey: letterhead.backgroundPdfKey || "",
      backgroundPdfName: letterhead.backgroundPdfName || "",
      fundId: letterhead.fundId || "",
    });
    setShowDialog(true);
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>, field: "headerImageUrl" | "footerImageUrl") {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validierung
    const allowedTypes = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Nur PNG, JPEG, SVG oder WebP erlaubt");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Datei darf maximal 2MB gross sein");
      return;
    }

    try {
      const formDataUpload = new FormData();
      formDataUpload.append("file", file);
      formDataUpload.append("category", "logo");

      const result = await uploadWithProgress("/api/upload", formDataUpload) as { url: string };
      setFormData({ ...formData, [field]: result.url });
      toast.success("Bild hochgeladen");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload fehlgeschlagen");
    }
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Nur PDF-Dateien erlaubt");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("PDF darf maximal 5MB gross sein");
      return;
    }

    try {
      const formDataUpload = new FormData();
      formDataUpload.append("file", file);
      formDataUpload.append("category", "letterhead");

      const result = await uploadWithProgress("/api/upload", formDataUpload) as { key: string; url: string };
      setFormData({
        ...formData,
        backgroundPdfKey: result.key,
        backgroundPdfName: file.name,
      });
      toast.success("Briefpapier-PDF hochgeladen");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload fehlgeschlagen");
    }
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      toast.error("Name erforderlich");
      return;
    }

    try {
      setIsSaving(true);

      const payload = {
        name: formData.name,
        headerImageUrl: formData.headerImageUrl || null,
        headerHeight: formData.headerHeight,
        logoPosition: formData.logoPosition,
        logoWidth: formData.logoWidth,
        logoMarginTop: formData.logoMarginTop,
        logoMarginLeft: formData.logoMarginLeft,
        senderAddress: formData.senderAddress || null,
        footerImageUrl: formData.footerImageUrl || null,
        footerHeight: formData.footerHeight,
        footerText: formData.footerText || null,
        marginTop: formData.marginTop,
        marginBottom: formData.marginBottom,
        marginLeft: formData.marginLeft,
        marginRight: formData.marginRight,
        primaryColor: formData.primaryColor || null,
        secondaryColor: formData.secondaryColor || null,
        isDefault: formData.isDefault,
        backgroundPdfKey: formData.backgroundPdfKey || null,
        backgroundPdfName: formData.backgroundPdfName || null,
        fundId: formData.fundId || null,
      };

      if (editingLetterhead) {
        await updateLetterhead(editingLetterhead.id, payload);
        toast.success("Briefpapier aktualisiert");
      } else {
        await createLetterhead(payload);
        toast.success("Briefpapier erstellt");
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
    setLetterheadToDelete(id);
    setDeleteDialogOpen(true);
  }

  async function handleConfirmDelete() {
    if (!letterheadToDelete) return;

    try {
      await deleteLetterhead(letterheadToDelete);
      toast.success("Briefpapier gelöscht");
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Löschen");
    } finally {
      setDeleteDialogOpen(false);
      setLetterheadToDelete(null);
    }
  }

  async function handleSetDefault(id: string) {
    try {
      await updateLetterhead(id, { isDefault: true });
      toast.success("Standard-Briefpapier gesetzt");
      mutate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler");
    }
  }

  async function handlePreview(id: string) {
    setPreviewLetterheadId(id);
    setIsLoadingPreview(true);
    try {
      const response = await fetch(`/api/admin/letterheads/${id}/preview`);
      if (!response.ok) {
        throw new Error("Vorschau konnte nicht geladen werden");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Laden der Vorschau");
    } finally {
      setIsLoadingPreview(false);
    }
  }

  if (isError) {
    return (
      <div className="p-4 text-red-600 bg-red-50 rounded-md">
        Fehler beim Laden der Briefpapiere
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
                <ImageIcon className="h-5 w-5" />
                Briefpapier
              </CardTitle>
              <CardDescription>
                Verwalten Sie Briefpapier-Vorlagen mit Header, Footer und Firmeninfo
              </CardDescription>
            </div>
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" />
              Neues Briefpapier
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : letterheadList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Kein Briefpapier vorhanden. Erstellen Sie Ihr erstes Briefpapier.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Windpark</TableHead>
                  <TableHead>Gesellschaft</TableHead>
                  <TableHead>Header</TableHead>
                  <TableHead>Standard</TableHead>
                  <TableHead className="w-[140px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {letterheadList.map((letterhead) => (
                  <TableRow key={letterhead.id}>
                    <TableCell className="font-medium">{letterhead.name}</TableCell>
                    <TableCell>
                      {letterhead.park ? (
                        <Badge variant="outline">{letterhead.park.name}</Badge>
                      ) : (
                        <span className="text-muted-foreground">Alle</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {letterhead.fund ? (
                        <Badge variant="outline">
                          {letterhead.fund.name}{letterhead.fund.legalForm ? ` ${letterhead.fund.legalForm}` : ""}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {letterhead.backgroundPdfKey ? (
                        <Badge variant="default">PDF-Hintergrund</Badge>
                      ) : letterhead.headerImageUrl ? (
                        <Badge variant="secondary">Mit Bild</Badge>
                      ) : (
                        <span className="text-muted-foreground">Ohne Bild</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {letterhead.isDefault ? (
                        <Badge className="bg-green-100 text-green-800">
                          <Star className="h-3 w-3 mr-1" />
                          Standard
                        </Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSetDefault(letterhead.id)}
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
                          onClick={() => handlePreview(letterhead.id)}
                          disabled={isLoadingPreview && previewLetterheadId === letterhead.id}
                          title="Vorschau"
                        >
                          {isLoadingPreview && previewLetterheadId === letterhead.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(letterhead)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(letterhead.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingLetterhead ? "Briefpapier bearbeiten" : "Neues Briefpapier"}
            </DialogTitle>
            <DialogDescription>
              Konfigurieren Sie das Erscheinungsbild Ihrer Dokumente
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
                  placeholder="z.B. Standard Briefpapier"
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

            {/* Zugehoerige Gesellschaft */}
            <div className="space-y-2">
              <Label htmlFor="fundId">Zugehoerige Gesellschaft</Label>
              <Select
                value={formData.fundId || "__none__"}
                onValueChange={(value) =>
                  setFormData({ ...formData, fundId: value === "__none__" ? "" : value })
                }
              >
                <SelectTrigger id="fundId">
                  <SelectValue placeholder="Keine (Mandanten-Standard)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Keine (Mandanten-Standard)</SelectItem>
                  {funds.map((fund) => (
                    <SelectItem key={fund.id} value={fund.id}>
                      {fund.name}{fund.legalForm ? ` ${fund.legalForm}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* PDF-Hintergrund */}
            <div className="space-y-4">
              <h4 className="font-medium">PDF-Hintergrund</h4>
              <p className="text-sm text-muted-foreground">
                Laden Sie ein fertiges Briefpapier als PDF hoch. Es wird als Hintergrund für alle Dokumente verwendet.
                Seite 1 = Titelseite, Seite 2 (optional) = Folgeseiten.
              </p>

              {formData.backgroundPdfKey ? (
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <FileText className="h-8 w-8 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{formData.backgroundPdfName || "briefpapier.pdf"}</p>
                    <p className="text-xs text-muted-foreground">PDF-Hintergrund aktiv</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFormData({ ...formData, backgroundPdfKey: "", backgroundPdfName: "" })}
                  >
                    Entfernen
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isUploading}
                    asChild
                  >
                    <label className="cursor-pointer">
                      {isUploading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      PDF hochladen
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={handlePdfUpload}
                      />
                    </label>
                  </Button>
                </div>
              )}
              {isUploading && (
                <div className="space-y-1">
                  <Progress value={imageUploadProgress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">
                    Wird hochgeladen... {imageUploadProgress}%
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {!formData.backgroundPdfKey && (
              <>
                {/* Header-Bereich */}
                <div className="space-y-4">
                  <h4 className="font-medium">Kopfbereich (Header)</h4>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Header-Bild</Label>
                      <div className="flex gap-2">
                        <Input
                          value={formData.headerImageUrl}
                          onChange={(e) =>
                            setFormData({ ...formData, headerImageUrl: e.target.value })
                          }
                          placeholder="URL oder hochladen"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={isUploading}
                          asChild
                        >
                          <label>
                            {isUploading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4" />
                            )}
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/svg+xml,image/webp"
                              className="hidden"
                              onChange={(e) => handleUpload(e, "headerImageUrl")}
                            />
                          </label>
                        </Button>
                      </div>
                      {isUploading && (
                        <div className="space-y-1">
                          <Progress value={imageUploadProgress} className="h-1.5" />
                          <p className="text-xs text-muted-foreground">
                            Wird hochgeladen... {imageUploadProgress}%
                          </p>
                        </div>
                      )}
                      {formData.headerImageUrl && (
                        <Image
                          src={formData.headerImageUrl}
                          alt="Header"
                          width={256}
                          height={64}
                          className="h-16 w-auto object-contain border rounded"
                          unoptimized
                        />
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="headerHeight">Header-Hoehe (mm)</Label>
                      <Input
                        id="headerHeight"
                        type="number"
                        min={0}
                        max={200}
                        value={formData.headerHeight}
                        onChange={(e) =>
                          setFormData({ ...formData, headerHeight: parseInt(e.target.value) || 100 })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="logoPosition">Logo-Position</Label>
                      <Select
                        value={formData.logoPosition}
                        onValueChange={(value) =>
                          setFormData({ ...formData, logoPosition: value })
                        }
                      >
                        <SelectTrigger id="logoPosition">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="top-left">Oben links</SelectItem>
                          <SelectItem value="top-center">Oben mitte</SelectItem>
                          <SelectItem value="top-right">Oben rechts</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="logoWidth">Logo-Breite (mm)</Label>
                      <Input
                        id="logoWidth"
                        type="number"
                        min={10}
                        max={100}
                        value={formData.logoWidth}
                        onChange={(e) =>
                          setFormData({ ...formData, logoWidth: parseInt(e.target.value) || 50 })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="logoMarginTop">Logo-Abstand oben (mm)</Label>
                      <Input
                        id="logoMarginTop"
                        type="number"
                        min={0}
                        max={50}
                        value={formData.logoMarginTop}
                        onChange={(e) =>
                          setFormData({ ...formData, logoMarginTop: parseInt(e.target.value) || 10 })
                        }
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Absender */}
                <div className="space-y-4">
                  <h4 className="font-medium">Absenderzeile</h4>
                  <div className="space-y-2">
                    <Label htmlFor="senderAddress">Kompakte Absenderzeile</Label>
                    <Input
                      id="senderAddress"
                      value={formData.senderAddress}
                      onChange={(e) =>
                        setFormData({ ...formData, senderAddress: e.target.value })
                      }
                      placeholder="Firma GmbH - Strasse 1 - 12345 Stadt"
                    />
                    <p className="text-xs text-muted-foreground">
                      Wird über dem Empfänger-Adressfeld angezeigt
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Footer-Bereich */}
                <div className="space-y-4">
                  <h4 className="font-medium">Fussbereich (Footer)</h4>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Footer-Bild</Label>
                      <div className="flex gap-2">
                        <Input
                          value={formData.footerImageUrl}
                          onChange={(e) =>
                            setFormData({ ...formData, footerImageUrl: e.target.value })
                          }
                          placeholder="URL oder hochladen"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          disabled={isUploading}
                          asChild
                        >
                          <label>
                            {isUploading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4" />
                            )}
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/svg+xml,image/webp"
                              className="hidden"
                              onChange={(e) => handleUpload(e, "footerImageUrl")}
                            />
                          </label>
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="footerHeight">Footer-Hoehe (mm)</Label>
                      <Input
                        id="footerHeight"
                        type="number"
                        min={0}
                        max={100}
                        value={formData.footerHeight}
                        onChange={(e) =>
                          setFormData({ ...formData, footerHeight: parseInt(e.target.value) || 25 })
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="footerText">Footer-Text</Label>
                    <Textarea
                      id="footerText"
                      value={formData.footerText}
                      onChange={(e) =>
                        setFormData({ ...formData, footerText: e.target.value })
                      }
                      placeholder="Geschaeftsfuehrer: Max Mustermann | Amtsgericht: ... | USt-IdNr.: ..."
                      rows={3}
                    />
                  </div>
                </div>

                <Separator />

                {/* Farben */}
                <div className="space-y-4">
                  <h4 className="font-medium">Farben (optional)</h4>
                  <p className="text-sm text-muted-foreground">
                    Überschreiben die Mandanten-Farben wenn gesetzt
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="primaryColor">Primaerfarbe</Label>
                      <div className="flex gap-2">
                        <Input
                          id="primaryColor"
                          value={formData.primaryColor}
                          onChange={(e) =>
                            setFormData({ ...formData, primaryColor: e.target.value })
                          }
                          placeholder="#335E99"
                        />
                        {formData.primaryColor && (
                          <div
                            className="w-10 h-10 rounded border"
                            style={{ backgroundColor: formData.primaryColor }}
                          />
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="secondaryColor">Sekundaerfarbe</Label>
                      <div className="flex gap-2">
                        <Input
                          id="secondaryColor"
                          value={formData.secondaryColor}
                          onChange={(e) =>
                            setFormData({ ...formData, secondaryColor: e.target.value })
                          }
                          placeholder="#1e40af"
                        />
                        {formData.secondaryColor && (
                          <div
                            className="w-10 h-10 rounded border"
                            style={{ backgroundColor: formData.secondaryColor }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />
              </>
            )}

            {/* Seitenraender */}
            <div className="space-y-4">
              <h4 className="font-medium">Seitenraender (mm)</h4>
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="marginTop">Oben</Label>
                  <Input
                    id="marginTop"
                    type="number"
                    min={10}
                    max={100}
                    value={formData.marginTop}
                    onChange={(e) =>
                      setFormData({ ...formData, marginTop: parseInt(e.target.value) || 45 })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="marginBottom">Unten</Label>
                  <Input
                    id="marginBottom"
                    type="number"
                    min={10}
                    max={100}
                    value={formData.marginBottom}
                    onChange={(e) =>
                      setFormData({ ...formData, marginBottom: parseInt(e.target.value) || 30 })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="marginLeft">Links</Label>
                  <Input
                    id="marginLeft"
                    type="number"
                    min={10}
                    max={50}
                    value={formData.marginLeft}
                    onChange={(e) =>
                      setFormData({ ...formData, marginLeft: parseInt(e.target.value) || 25 })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="marginRight">Rechts</Label>
                  <Input
                    id="marginRight"
                    type="number"
                    min={10}
                    max={50}
                    value={formData.marginRight}
                    onChange={(e) =>
                      setFormData({ ...formData, marginRight: parseInt(e.target.value) || 20 })
                    }
                  />
                </div>
              </div>
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
        title="Briefpapier löschen"
        description="Möchten Sie dieses Briefpapier wirklich löschen?"
      />
    </div>
  );
}
