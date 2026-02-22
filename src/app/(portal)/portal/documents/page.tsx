"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useDebounce } from "@/hooks/useDebounce";
import {
  FolderOpen,
  FileText,
  Download,
  Search,
  Filter,
  File,
  FileSpreadsheet,
  FileImage,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Document {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  fund: {
    id: string;
    name: string;
  } | null;
  uploadedBy: string | null;
  createdAt: string;
}

const categoryLabels: Record<string, string> = {
  REPORT: "Bericht",
  CONTRACT: "Vertrag",
  PROTOCOL: "Protokoll",
  CORRESPONDENCE: "Korrespondenz",
  TAX: "Steuer",
  OTHER: "Sonstiges",
};

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return File;
  if (mimeType.includes("pdf")) return FileText;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
    return FileSpreadsheet;
  if (mimeType.includes("image")) return FileImage;
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    fetchDocuments();
  }, [categoryFilter]);

  async function fetchDocuments() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (categoryFilter !== "all") {
        params.set("category", categoryFilter);
      }

      const response = await fetch(`/api/portal/my-documents?${params}`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.data || []);
        setCategories(data.categories || []);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }

  const filteredDocuments = documents.filter((doc) => {
    if (!debouncedSearch) return true;
    const searchLower = debouncedSearch.toLowerCase();
    return (
      doc.title.toLowerCase().includes(searchLower) ||
      doc.fileName.toLowerCase().includes(searchLower) ||
      doc.fund?.name.toLowerCase().includes(searchLower)
    );
  });

  async function handleDownload(doc: Document) {
    try {
      setDownloadingId(doc.id);

      // Fetch the presigned URL from the download endpoint
      const response = await fetch(`/api/documents/${doc.id}/download`);

      if (!response.ok) {
        throw new Error("Download fehlgeschlagen");
      }

      const data = await response.json();

      if (data.url) {
        // Open the presigned URL in a new tab to trigger download
        // Using a hidden anchor element for better download behavior
        const link = document.createElement("a");
        link.href = data.url;
        link.download = doc.fileName;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch {
      toast.error("Fehler beim Herunterladen des Dokuments");
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dokumente</h1>
        <p className="text-muted-foreground">
          Berichte, Protokolle und weitere Dokumente zu Ihren Beteiligungen
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suchen nach Titel, Dateiname..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Kategorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Kategorien</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {categoryLabels[cat] || cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Verfügbare Dokumente
          </CardTitle>
          <CardDescription>
            {filteredDocuments.length} Dokument(e) gefunden
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredDocuments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {documents.length === 0
                ? "Keine Dokumente verfügbar."
                : "Keine Dokumente gefunden."}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dokument</TableHead>
                    <TableHead>Gesellschaft</TableHead>
                    <TableHead>Kategorie</TableHead>
                    <TableHead>Datum</TableHead>
                    <TableHead className="text-right">Größe</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.map((doc) => {
                    const FileIcon = getFileIcon(doc.mimeType);
                    return (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <FileIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                            <div>
                              <p className="font-medium">{doc.title}</p>
                              <p className="text-sm text-muted-foreground">
                                {doc.fileName}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{doc.fund?.name || "-"}</TableCell>
                        <TableCell>
                          {doc.category && (
                            <Badge variant="outline">
                              {categoryLabels[doc.category] || doc.category}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {format(new Date(doc.createdAt), "dd.MM.yyyy", {
                            locale: de,
                          })}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatFileSize(doc.fileSize)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Herunterladen"
                            onClick={() => handleDownload(doc)}
                            disabled={downloadingId === doc.id}
                          >
                            <Download className={`h-4 w-4 ${downloadingId === doc.id ? "animate-pulse" : ""}`} />
                          </Button>
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
    </div>
  );
}
