"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Plus,
  Search,
  FolderOpen,
  FileText,
  File,
  FileSpreadsheet,
  FileImage,
  MoreHorizontal,
  Eye,
  Pencil,
  Download,
  Trash2,
  Filter,
  Upload,
  History,
  X,
  Loader2,
  Command,
  FolderEdit,
  CheckCircle2,
  SendHorizontal,
} from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { useBatchSelection } from "@/hooks/useBatchSelection";
import { useApiQuery, useApiMutation, useInvalidateQuery } from "@/hooks/useApiQuery";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { BatchActionBar } from "@/components/ui/batch-action-bar";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { DocumentPreviewDialog, DocumentSearchDialog } from "@/components/documents";

interface SearchHighlight {
  field: string;
  snippet: string;
}

interface Document {
  id: string;
  title: string;
  description: string | null;
  category: string;
  fileName: string;
  fileUrl: string;
  fileSizeBytes: number | null;
  mimeType: string | null;
  version: number;
  tags: string[];
  isArchived: boolean;
  approvalStatus: string;
  park: { id: string; name: string; shortName: string | null } | null;
  fund: { id: string; name: string } | null;
  turbine: { id: string; designation: string } | null;
  contract: { id: string; title: string } | null;
  uploadedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  publishedAt: string | null;
  versionCount: number;
  createdAt: string;
  // Search-specific fields (only present in search results)
  relevanceScore?: number;
  highlights?: SearchHighlight[];
}

const categoryConfig: Record<string, { label: string; color: string }> = {
  CONTRACT: { label: "Vertrag", color: "bg-blue-100 text-blue-800" },
  PROTOCOL: { label: "Protokoll", color: "bg-purple-100 text-purple-800" },
  REPORT: { label: "Bericht", color: "bg-green-100 text-green-800" },
  INVOICE: { label: "Rechnung", color: "bg-orange-100 text-orange-800" },
  PERMIT: { label: "Genehmigung", color: "bg-red-100 text-red-800" },
  CORRESPONDENCE: { label: "Korrespondenz", color: "bg-yellow-100 text-yellow-800" },
  OTHER: { label: "Sonstiges", color: "bg-gray-100 text-gray-800" },
};

const approvalStatusConfig: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Entwurf", color: "bg-gray-100 text-gray-800" },
  PENDING_REVIEW: { label: "In Pruefung", color: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "Genehmigt", color: "bg-blue-100 text-blue-800" },
  PUBLISHED: { label: "Veroeffentlicht", color: "bg-green-100 text-green-800" },
  REJECTED: { label: "Abgelehnt", color: "bg-red-100 text-red-800" },
};

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return File;
  if (mimeType.includes("pdf")) return FileText;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
    return FileSpreadsheet;
  if (mimeType.includes("image")) return FileImage;
  return File;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "-";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

interface DocumentsResponse {
  data: Document[];
  categoryCounts?: Record<string, number>;
  approvalStatusCounts?: Record<string, number>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function DocumentsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const limit = 20;
  const debouncedSearch = useDebounce(search, 300);

  const isSearching = !!(debouncedSearch && debouncedSearch.length >= 2);

  // Search Dialog State (Cmd+K)
  const [searchDialogOpen, setSearchDialogOpen] = useState(false);

  // Preview Dialog State
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);

  // Delete Dialog State
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Document | null>(null);

  const invalidate = useInvalidateQuery();

  // Keyboard shortcut for search dialog (Cmd+K / Ctrl+K)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchDialogOpen(true);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Build query params for listing
  const listParams = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
    ...(categoryFilter !== "all" && { category: categoryFilter }),
    ...(approvalStatusFilter !== "all" && { approvalStatus: approvalStatusFilter }),
  });

  // Build query params for search
  const searchParams = new URLSearchParams({
    q: debouncedSearch,
    page: page.toString(),
    limit: limit.toString(),
    ...(categoryFilter !== "all" && { category: categoryFilter }),
    ...(approvalStatusFilter !== "all" && { approvalStatus: approvalStatusFilter }),
  });

  // Fetch documents (listing mode - when not searching)
  const { data: listData, isLoading: listLoading, error: listError, refetch: refetchList } = useApiQuery<DocumentsResponse>(
    ["documents", categoryFilter, approvalStatusFilter, page.toString()],
    `/api/documents?${listParams}`,
    { enabled: !isSearching }
  );

  // Fetch documents (search mode - when searching)
  const { data: searchData, isLoading: searchLoading, error: searchError } = useApiQuery<DocumentsResponse>(
    ["documents-search", debouncedSearch, categoryFilter, approvalStatusFilter, page.toString()],
    `/api/documents/search?${searchParams}`,
    { enabled: isSearching }
  );

  // Use the appropriate data based on mode
  const activeData = isSearching ? searchData : listData;
  const loading = isSearching ? searchLoading : listLoading;
  const error = isSearching ? searchError : listError;

  const filteredDocuments = activeData?.data ?? [];
  const categoryCounts = listData?.categoryCounts ?? {};
  const approvalStatusCounts = listData?.approvalStatusCounts ?? {};
  const pagination = activeData?.pagination ?? { page: 1, limit, total: 0, totalPages: 0 };
  const searchResultCount = isSearching ? (searchData?.pagination?.total ?? null) : null;

  // Batch selection
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const {
    selectedIds,
    isAllSelected,
    isSomeSelected,
    toggleItem,
    toggleAll,
    clearSelection,
    selectedCount,
  } = useBatchSelection({ items: filteredDocuments });

  // Category change dialog
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [selectedNewCategory, setSelectedNewCategory] = useState<string>("");

  // Clear selection on filter / page change
  useEffect(() => {
    clearSelection();
  }, [categoryFilter, approvalStatusFilter, page, debouncedSearch, clearSelection]);

  // Delete mutation
  const deleteMutation = useApiMutation(
    async (id: string) => {
      const response = await fetch(`/api/documents/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Fehler beim Loeschen" }));
        throw new Error(data.error || "Fehler beim Loeschen des Dokuments");
      }
      return response.json();
    },
    {
      onSuccess: () => {
        invalidate(["documents"]);
        invalidate(["documents-search"]);
      },
      onError: (error) => {
        toast.error(error.message || "Fehler beim Loeschen des Dokuments");
      },
    }
  );

  function clearSearch() {
    setSearch("");
    setPage(1);
  }

  // Batch: delete selected documents
  async function handleBatchDelete() {
    const ids = filteredDocuments
      .filter((doc) => selectedIds.has(doc.id))
      .map((doc) => doc.id);

    if (ids.length === 0) return;

    setIsBatchProcessing(true);
    let successCount = 0;
    let failCount = 0;

    for (const id of ids) {
      try {
        const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
        if (response.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    setIsBatchProcessing(false);
    clearSelection();
    invalidate(["documents"]);
    invalidate(["documents-search"]);

    if (failCount === 0) {
      toast.success(`${successCount} Dokument(e) erfolgreich geloescht`);
    } else {
      toast.warning(`${successCount} geloescht, ${failCount} fehlgeschlagen`);
    }
  }

  // Batch: download selected as ZIP (placeholder)
  function handleBatchDownload() {
    toast.info("ZIP-Download in Entwicklung");
  }

  // Batch: change category for selected
  async function handleBatchCategoryChange(newCategory: string) {
    const ids = filteredDocuments
      .filter((doc) => selectedIds.has(doc.id))
      .map((doc) => doc.id);

    if (ids.length === 0) return;

    setIsBatchProcessing(true);
    let successCount = 0;
    let failCount = 0;

    for (const id of ids) {
      try {
        const response = await fetch(`/api/documents/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: newCategory }),
        });
        if (response.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    setIsBatchProcessing(false);
    clearSelection();
    invalidate(["documents"]);
    invalidate(["documents-search"]);

    if (failCount === 0) {
      toast.success(`${successCount} Dokument(e) aktualisiert`);
    } else {
      toast.warning(`${successCount} aktualisiert, ${failCount} fehlgeschlagen`);
    }
  }

  // Batch: approve selected documents (submit for review, approve, or publish)
  async function handleBatchApprove(action: "submit" | "approve" | "publish") {
    const ids = filteredDocuments
      .filter((doc) => selectedIds.has(doc.id))
      .map((doc) => doc.id);

    if (ids.length === 0) return;

    setIsBatchProcessing(true);
    let successCount = 0;
    let failCount = 0;

    for (const id of ids) {
      try {
        const response = await fetch(`/api/documents/${id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            [action]: true,
          }),
        });
        if (response.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch {
        failCount++;
      }
    }

    setIsBatchProcessing(false);
    clearSelection();
    invalidate(["documents"]);
    invalidate(["documents-search"]);

    const actionLabels = {
      submit: "zur Pruefung eingereicht",
      approve: "genehmigt",
      publish: "veroeffentlicht",
    };

    if (failCount === 0) {
      toast.success(`${successCount} Dokument(e) ${actionLabels[action]}`);
    } else {
      toast.warning(`${successCount} ${actionLabels[action]}, ${failCount} fehlgeschlagen`);
    }
  }

  const totalDocs = Object.values(categoryCounts).reduce((a, b) => a + b, 0);

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-destructive">Fehler beim Laden der Dokumente</p>
        <Button onClick={() => refetchList()} variant="outline" className="mt-4">
          Erneut versuchen
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Dokumente"
        description="Verwalten Sie alle Dokumente mit Versionierung"
        actions={
          <Button asChild>
            <Link href="/documents/upload">
              <Upload className="mr-2 h-4 w-4" />
              Hochladen
            </Link>
          </Button>
        }
      />

      {/* Category Stats */}
      <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-8">
        <Card
          className={`cursor-pointer transition-colors ${
            categoryFilter === "all" ? "ring-2 ring-primary" : ""
          }`}
          onClick={() => { setCategoryFilter("all"); setPage(1); }}
        >
          <CardContent className="pt-4 pb-4">
            <div className="text-2xl font-bold">{totalDocs}</div>
            <p className="text-xs text-muted-foreground">Alle</p>
          </CardContent>
        </Card>
        {Object.entries(categoryConfig).map(([key, config]) => (
          <Card
            key={key}
            className={`cursor-pointer transition-colors ${
              categoryFilter === key ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => { setCategoryFilter(key); setPage(1); }}
          >
            <CardContent className="pt-4 pb-4">
              <div className="text-2xl font-bold">{categoryCounts[key] || 0}</div>
              <p className="text-xs text-muted-foreground">{config.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search & Table */}
      <Card>
        <CardHeader>
          <CardTitle>Dokumentenübersicht</CardTitle>
          <CardDescription>Alle Dokumente mit Versionsverlauf</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suchen nach Titel, Dateiname, Beschreibung..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-8 pr-20"
              />
              {search && (
                <button
                  onClick={clearSearch}
                  className="absolute right-12 top-2.5 text-muted-foreground hover:text-foreground"
                  title="Suche loeschen"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setSearchDialogOpen(true)}
                className="absolute right-2.5 top-2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded border"
                title="Schnellsuche (Ctrl+K)"
              >
                <span className="flex items-center gap-1">
                  <Command className="h-3 w-3" />K
                </span>
              </button>
            </div>
            <Select value={categoryFilter} onValueChange={(val) => { setCategoryFilter(val); setPage(1); }}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Kategorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Kategorien</SelectItem>
                {Object.entries(categoryConfig).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={approvalStatusFilter} onValueChange={(val) => { setApprovalStatusFilter(val); setPage(1); }}>
              <SelectTrigger className="w-[200px]">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                {Object.entries(approvalStatusConfig).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      {config.label}
                      {approvalStatusCounts[key] ? (
                        <span className="text-xs text-muted-foreground">
                          ({approvalStatusCounts[key]})
                        </span>
                      ) : null}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Search Results Info */}
          {searchResultCount !== null && (
            <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              <span>
                {searchResultCount} {searchResultCount === 1 ? "Ergebnis" : "Ergebnisse"} fuer &quot;{debouncedSearch}&quot;
                {categoryFilter !== "all" && (
                  <span> in {categoryConfig[categoryFilter]?.label || categoryFilter}</span>
                )}
              </span>
              <button
                onClick={clearSearch}
                className="text-primary hover:underline ml-2"
              >
                Suche loeschen
              </button>
            </div>
          )}

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={isAllSelected}
                      ref={(el) => {
                        if (el) {
                          (el as unknown as HTMLInputElement).indeterminate = isSomeSelected;
                        }
                      }}
                      onCheckedChange={toggleAll}
                      aria-label="Alle auswaehlen"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </TableHead>
                  <TableHead>Dokument</TableHead>
                  <TableHead>Kategorie</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Zuordnung</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Groesse</TableHead>
                  <TableHead>Hochgeladen</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredDocuments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                      Keine Dokumente gefunden
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDocuments.map((doc) => {
                    const FileIcon = getFileIcon(doc.mimeType);
                    const catConfig = categoryConfig[doc.category];

                    return (
                      <TableRow
                        key={doc.id}
                        className={`cursor-pointer hover:bg-muted/50 ${selectedIds.has(doc.id) ? "bg-primary/5" : ""}`}
                        onClick={() => router.push(`/documents/${doc.id}`)}
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/documents/${doc.id}`); } }}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(doc.id)}
                            onCheckedChange={() => toggleItem(doc.id)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`${doc.title} auswaehlen`}
                          />
                        </TableCell>
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
                        <TableCell>
                          <Badge variant="secondary" className={catConfig?.color}>
                            {catConfig?.label || doc.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const statusConfig = approvalStatusConfig[doc.approvalStatus];
                            return statusConfig ? (
                              <Badge variant="secondary" className={statusConfig.color}>
                                {statusConfig.label}
                              </Badge>
                            ) : (
                              <Badge variant="secondary">{doc.approvalStatus}</Badge>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          {doc.park && (
                            <Badge variant="outline">
                              {doc.park.shortName || doc.park.name}
                            </Badge>
                          )}
                          {doc.fund && (
                            <Badge variant="outline">{doc.fund.name}</Badge>
                          )}
                          {doc.contract && (
                            <Badge variant="outline">{doc.contract.title}</Badge>
                          )}
                          {!doc.park && !doc.fund && !doc.contract && (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <span>v{doc.version}</span>
                            {doc.versionCount > 1 && (
                              <Badge variant="secondary" className="ml-1">
                                <History className="h-3 w-3 mr-1" />
                                {doc.versionCount}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatFileSize(doc.fileSizeBytes)}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>
                              {format(new Date(doc.createdAt), "dd.MM.yyyy", {
                                locale: de,
                              })}
                            </p>
                            {doc.uploadedBy && (
                              <p className="text-muted-foreground">{doc.uploadedBy}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Vorschau"
                              title="Vorschau"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewDocument(doc);
                                setPreviewOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Weitere Aktionen">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/documents/${doc.id}`);
                                  }}
                                >
                                  <FileText className="mr-2 h-4 w-4" />
                                  Anzeigen
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    window.open(doc.fileUrl, "_blank");
                                  }}
                                >
                                  <Download className="mr-2 h-4 w-4" />
                                  Herunterladen
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDocumentToDelete(doc);
                                    setDeleteDialogOpen(true);
                                  }}
                                  className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Loeschen
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Zeige {(pagination.page - 1) * pagination.limit + 1} bis{" "}
                {Math.min(pagination.page * pagination.limit, pagination.total)}{" "}
                von {pagination.total} Dokumenten
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Zurueck
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Weiter
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Document Preview Dialog */}
      <DocumentPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        document={previewDocument}
      />

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={async () => {
          if (documentToDelete) {
            await deleteMutation.mutateAsync(documentToDelete.id);
            setDocumentToDelete(null);
          }
        }}
        title="Dokument loeschen"
        itemName={documentToDelete?.title}
      />

      {/* Quick Search Dialog (Cmd+K) */}
      <DocumentSearchDialog
        open={searchDialogOpen}
        onOpenChange={setSearchDialogOpen}
      />

      {/* Batch Category Change Dialog */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kategorie aendern</DialogTitle>
            <DialogDescription>
              Waehlen Sie die neue Kategorie fuer die {selectedCount} ausgewaehlten Dokumente.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedNewCategory} onValueChange={setSelectedNewCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Kategorie auswaehlen..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(categoryConfig).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCategoryDialogOpen(false);
                setSelectedNewCategory("");
              }}
            >
              Abbrechen
            </Button>
            <Button
              disabled={!selectedNewCategory || isBatchProcessing}
              onClick={async () => {
                setIsCategoryDialogOpen(false);
                await handleBatchCategoryChange(selectedNewCategory);
                setSelectedNewCategory("");
              }}
            >
              {isBatchProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Aendern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedCount}
        onClearSelection={clearSelection}
        actions={[
          {
            label: "Zur Pruefung einreichen",
            icon: <SendHorizontal className="h-4 w-4" />,
            onClick: () => handleBatchApprove("submit"),
            disabled: isBatchProcessing,
          },
          {
            label: "Genehmigen",
            icon: <CheckCircle2 className="h-4 w-4" />,
            onClick: () => handleBatchApprove("approve"),
            disabled: isBatchProcessing,
          },
          {
            label: "Herunterladen",
            icon: <Download className="h-4 w-4" />,
            onClick: handleBatchDownload,
            disabled: isBatchProcessing,
          },
          {
            label: "Kategorie aendern",
            icon: <FolderEdit className="h-4 w-4" />,
            onClick: () => setIsCategoryDialogOpen(true),
            disabled: isBatchProcessing,
          },
          {
            label: "Loeschen",
            icon: isBatchProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />,
            onClick: handleBatchDelete,
            variant: "destructive",
            disabled: isBatchProcessing,
          },
        ]}
      />
    </div>
  );
}
