"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  FileText,
  Download,
  Eye,
  Trash2,
  Plus,
  Upload,
  Search,
  Loader2,
  X,
  Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useFileUpload } from "@/hooks/useFileUpload";
import { DocumentPreviewDialog } from "@/components/documents";

interface ContractDocument {
  id: string;
  title: string;
  description: string | null;
  fileName: string;
  fileUrl: string;
  fileSizeBytes: number | null;
  mimeType: string | null;
  category: string;
  tags: string[];
  version: number;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AvailableDocument {
  id: string;
  title: string;
  fileName: string;
  category: string;
  createdAt: string;
}

interface ContractDocumentsProps {
  contractId: string;
}

const categoryConfig: Record<string, { label: string; color: string }> = {
  CONTRACT: { label: "Vertrag", color: "bg-blue-100 text-blue-800" },
  PROTOCOL: { label: "Protokoll", color: "bg-purple-100 text-purple-800" },
  REPORT: { label: "Bericht", color: "bg-green-100 text-green-800" },
  INVOICE: { label: "Rechnung", color: "bg-orange-100 text-orange-800" },
  PERMIT: { label: "Genehmigung", color: "bg-pink-100 text-pink-800" },
  CORRESPONDENCE: { label: "Korrespondenz", color: "bg-yellow-100 text-yellow-800" },
  OTHER: { label: "Sonstiges", color: "bg-gray-100 text-gray-800" },
};

export function ContractDocuments({ contractId }: ContractDocumentsProps) {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<ContractDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [unlinkDialogOpen, setUnlinkDialogOpen] = useState(false);
  const [documentToUnlink, setDocumentToUnlink] = useState<ContractDocument | null>(null);
  const [previewDocument, setPreviewDocument] = useState<ContractDocument | null>(null);

  // Add dialog state
  const [activeTab, setActiveTab] = useState<"link" | "upload">("link");
  const [availableDocuments, setAvailableDocuments] = useState<AvailableDocument[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategory, setUploadCategory] = useState("CONTRACT");
  const [uploading, setUploading] = useState(false);

  const { upload: uploadWithProgress, isUploading: isFileUploading, progress: fileUploadProgress } = useFileUpload();

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/contracts/${contractId}/documents`);
      if (!response.ok) throw new Error("Fehler beim Laden");
      const data = await response.json();
      setDocuments(data.data);
    } catch {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: "Dokumente konnten nicht geladen werden",
      });
    } finally {
      setLoading(false);
    }
  }, [contractId, toast]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  async function fetchAvailableDocuments(search: string = "") {
    try {
      setLoadingAvailable(true);
      // Hole Dokumente die noch nicht mit einem Vertrag verknuepft sind
      const params = new URLSearchParams({
        limit: "50",
        ...(search && { search }),
      });
      const response = await fetch(`/api/documents?${params}`);
      if (!response.ok) throw new Error("Fehler beim Laden");
      const data = await response.json();
      // Filtere Dokumente die bereits mit diesem Vertrag verknuepft sind
      const linkedIds = new Set(documents.map((d) => d.id));
      setAvailableDocuments(
        data.data.filter((doc: AvailableDocument) => !linkedIds.has(doc.id))
      );
    } catch {
      // Available documents fetch failed silently
    } finally {
      setLoadingAvailable(false);
    }
  }

  async function handleLinkDocument() {
    if (!selectedDocumentId) return;

    try {
      setLinking(true);
      const response = await fetch(`/api/contracts/${contractId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: selectedDocumentId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Fehler beim Verknuepfen");
      }

      toast({
        title: "Erfolg",
        description: "Dokument wurde verknuepft",
      });
      setAddDialogOpen(false);
      setSelectedDocumentId(null);
      fetchDocuments();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error instanceof Error ? error.message : "Dokument konnte nicht verknuepft werden",
      });
    } finally {
      setLinking(false);
    }
  }

  async function handleUploadDocument() {
    if (!uploadFile || !uploadTitle) return;

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("title", uploadTitle);
      formData.append("category", uploadCategory);
      formData.append("contractId", contractId);

      await uploadWithProgress("/api/documents", formData);

      toast({
        title: "Erfolg",
        description: "Dokument wurde hochgeladen und verknuepft",
      });
      setAddDialogOpen(false);
      resetUploadForm();
      fetchDocuments();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error instanceof Error ? error.message : "Dokument konnte nicht hochgeladen werden",
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleUnlinkDocument() {
    if (!documentToUnlink) return;

    try {
      const response = await fetch(
        `/api/contracts/${contractId}/documents?documentId=${documentToUnlink.id}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Fehler beim Entfernen");
      }

      toast({
        title: "Erfolg",
        description: "Dokument-Verknuepfung wurde entfernt",
      });
      setUnlinkDialogOpen(false);
      setDocumentToUnlink(null);
      fetchDocuments();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Fehler",
        description: error instanceof Error ? error.message : "Verknuepfung konnte nicht entfernt werden",
      });
    }
  }

  function resetUploadForm() {
    setUploadFile(null);
    setUploadTitle("");
    setUploadCategory("CONTRACT");
  }

  function handleDialogOpen(open: boolean) {
    setAddDialogOpen(open);
    if (open) {
      fetchAvailableDocuments();
    } else {
      setSelectedDocumentId(null);
      setSearchTerm("");
      resetUploadForm();
    }
  }

  function formatFileSize(bytes: number | null): string {
    if (!bytes) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getFileIcon(mimeType: string | null): string {
    if (!mimeType) return "file";
    if (mimeType.includes("pdf")) return "pdf";
    if (mimeType.includes("image")) return "image";
    if (mimeType.includes("word") || mimeType.includes("document")) return "word";
    if (mimeType.includes("excel") || mimeType.includes("spreadsheet")) return "excel";
    return "file";
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>Dokumente</CardTitle>
            <CardDescription>
              Mit diesem Vertrag verknuepfte Dokumente
            </CardDescription>
          </div>
          <Button onClick={() => handleDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Dokument hinzufügen
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">Keine Dokumente vorhanden</p>
              <p className="text-sm mt-1">
                Fuegen Sie Dokumente hinzu, um sie mit diesem Vertrag zu verknuepfen.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dokument</TableHead>
                    <TableHead>Kategorie</TableHead>
                    <TableHead>Größe</TableHead>
                    <TableHead>Hochgeladen</TableHead>
                    <TableHead className="w-[120px]">Aktionen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => {
                    const catConfig = categoryConfig[doc.category];
                    return (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="font-medium truncate">{doc.title}</p>
                              <p className="text-sm text-muted-foreground truncate">
                                {doc.fileName}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={catConfig?.color}>
                            {catConfig?.label || doc.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatFileSize(doc.fileSizeBytes)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          <div>
                            <p>
                              {format(new Date(doc.createdAt), "dd.MM.yyyy", {
                                locale: de,
                              })}
                            </p>
                            {doc.uploadedBy && (
                              <p className="text-xs">{doc.uploadedBy}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setPreviewDocument(doc)}
                              title="Vorschau"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                window.open(
                                  `/api/documents/${doc.id}/download?redirect=true`,
                                  "_blank"
                                );
                              }}
                              title="Herunterladen"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setDocumentToUnlink(doc);
                                setUnlinkDialogOpen(true);
                              }}
                              title="Verknuepfung entfernen"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Document Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={handleDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dokument hinzufügen</DialogTitle>
            <DialogDescription>
              Verknuepfen Sie ein bestehendes Dokument oder laden Sie ein neues hoch.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "link" | "upload")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="link" className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                Bestehendes verknuepfen
              </TabsTrigger>
              <TabsTrigger value="upload" className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Neues hochladen
              </TabsTrigger>
            </TabsList>

            <TabsContent value="link" className="space-y-4 mt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Dokumente suchen..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    fetchAvailableDocuments(e.target.value);
                  }}
                  className="pl-9"
                />
              </div>

              <div className="border rounded-lg max-h-[300px] overflow-auto">
                {loadingAvailable ? (
                  <div className="p-8 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">Lade Dokumente...</p>
                  </div>
                ) : availableDocuments.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Keine verfügbaren Dokumente gefunden</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {availableDocuments.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => setSelectedDocumentId(doc.id)}
                        className={`w-full p-3 text-left hover:bg-muted/50 transition-colors ${
                          selectedDocumentId === doc.id
                            ? "bg-primary/10 border-l-2 border-primary"
                            : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{doc.title}</p>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span className="truncate">{doc.fileName}</span>
                              <span>-</span>
                              <Badge variant="secondary" className="text-xs">
                                {categoryConfig[doc.category]?.label || doc.category}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => handleDialogOpen(false)}>
                  Abbrechen
                </Button>
                <Button
                  onClick={handleLinkDocument}
                  disabled={!selectedDocumentId || linking}
                >
                  {linking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verknuepfen
                </Button>
              </DialogFooter>
            </TabsContent>

            <TabsContent value="upload" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="file">Datei</Label>
                  <Input
                    id="file"
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setUploadFile(file);
                        if (!uploadTitle) {
                          setUploadTitle(file.name.replace(/\.[^/.]+$/, ""));
                        }
                      }
                    }}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.txt,.csv"
                    disabled={isFileUploading}
                  />
                  {uploadFile && (
                    <p className="text-sm text-muted-foreground">
                      {uploadFile.name} ({formatFileSize(uploadFile.size)})
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="title">Titel</Label>
                  <Input
                    id="title"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="Dokumenttitel eingeben"
                    disabled={isFileUploading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Kategorie</Label>
                  <Select value={uploadCategory} onValueChange={setUploadCategory} disabled={isFileUploading}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(categoryConfig).map(([value, { label }]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isFileUploading && (
                <div className="space-y-2">
                  <Progress value={fileUploadProgress} className="h-2" />
                  <p className="text-sm text-muted-foreground text-center">
                    Wird hochgeladen... {fileUploadProgress}%
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => handleDialogOpen(false)} disabled={isFileUploading}>
                  Abbrechen
                </Button>
                <Button
                  onClick={handleUploadDocument}
                  disabled={!uploadFile || !uploadTitle || uploading || isFileUploading}
                >
                  {(uploading || isFileUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isFileUploading ? `Wird hochgeladen... ${fileUploadProgress}%` : "Hochladen"}
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Unlink Confirmation Dialog */}
      <AlertDialog open={unlinkDialogOpen} onOpenChange={setUnlinkDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Verknuepfung entfernen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie die Verknuepfung des Dokuments &quot;{documentToUnlink?.title}&quot; mit
              diesem Vertrag wirklich entfernen? Das Dokument selbst wird nicht gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnlinkDocument}>
              Entfernen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Document Preview Dialog */}
      <DocumentPreviewDialog
        open={!!previewDocument}
        onOpenChange={(open) => !open && setPreviewDocument(null)}
        document={previewDocument}
      />
    </>
  );
}
