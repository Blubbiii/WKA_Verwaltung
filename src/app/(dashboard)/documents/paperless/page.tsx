"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Search,
  FileArchive,
  ExternalLink,
  Download,
  Eye,
  Loader2,
  X,
  Filter,
  RefreshCw,
  FileText,
  Tag,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useDebounce } from "@/hooks/useDebounce";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

// =============================================================================
// TYPES
// =============================================================================

interface PaperlessDocument {
  id: number;
  title: string;
  content: string;
  correspondent: number | null;
  document_type: number | null;
  tags: number[];
  created: string;
  created_date: string;
  modified: string;
  added: string;
  original_file_name: string;
  archived_file_name: string | null;
  archive_serial_number: number | null;
}

interface PaperlessDocumentList {
  count: number;
  next: string | null;
  previous: string | null;
  results: PaperlessDocument[];
}

interface PaperlessTag {
  id: number;
  name: string;
  colour: number;
  document_count: number;
}

interface PaperlessDocumentType {
  id: number;
  name: string;
  document_count: number;
}

interface PaperlessCorrespondent {
  id: number;
  name: string;
  document_count: number;
}

interface Metadata {
  tags: PaperlessTag[];
  documentTypes: PaperlessDocumentType[];
  correspondents: PaperlessCorrespondent[];
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function PaperlessDocumentsPage() {
  const t = useTranslations("documents.paperless");
  const tCommon = useTranslations("common");
  const { flags, loading: flagsLoading } = useFeatureFlags();

  // State
  const [documents, setDocuments] = useState<PaperlessDocument[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [correspondentFilter, setCorrespondentFilter] = useState<string>("all");
  const pageSize = 25;
  const debouncedSearch = useDebounce(search, 400);

  // Detail Sheet
  const [selectedDoc, setSelectedDoc] = useState<PaperlessDocument | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Load metadata (tags, types, correspondents)
  useEffect(() => {
    async function loadMetadata() {
      try {
        const res = await fetch("/api/integrations/paperless/metadata");
        if (res.ok) {
          const data = await res.json();
          setMetadata(data);
        }
      } catch {
        // Metadata is optional for display
      }
    }
    if (flags.paperless) {
      loadMetadata();
    }
  }, [flags.paperless]);

  // Load documents
  useEffect(() => {
    async function loadDocuments() {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          page: page.toString(),
          pageSize: pageSize.toString(),
          ordering: "-created",
        });

        if (debouncedSearch) {
          params.set("query", debouncedSearch);
        }
        if (tagFilter !== "all") {
          params.set("tags", tagFilter);
        }
        if (typeFilter !== "all") {
          params.set("documentType", typeFilter);
        }
        if (correspondentFilter !== "all") {
          params.set("correspondent", correspondentFilter);
        }

        const res = await fetch(`/api/integrations/paperless/documents?${params}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: t("errorLoading") }));
          throw new Error(err.error || t("errorLoading"));
        }

        const data: PaperlessDocumentList = await res.json();
        setDocuments(data.results);
        setTotalCount(data.count);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("errorLoading")
        );
        setDocuments([]);
        setTotalCount(0);
      } finally {
        setLoading(false);
      }
    }

    if (flags.paperless) {
      loadDocuments();
    }
  }, [flags.paperless, page, pageSize, debouncedSearch, tagFilter, typeFilter, correspondentFilter]);

  // Reset page on filter change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, tagFilter, typeFilter, correspondentFilter]);

  // Load preview when detail opens
  useEffect(() => {
    if (!selectedDoc || !detailOpen) {
      setPreviewUrl(null);
      return;
    }

    async function loadPreview() {
      setPreviewLoading(true);
      try {
        const res = await fetch(`/api/integrations/paperless/documents/${selectedDoc!.id}/preview`);
        if (res.ok) {
          const blob = await res.blob();
          setPreviewUrl(URL.createObjectURL(blob));
        }
      } catch {
        // Preview not critical
      } finally {
        setPreviewLoading(false);
      }
    }

    loadPreview();

    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDoc, detailOpen]);

  // Helper: resolve tag/type/correspondent names
  const getTagName = (id: number): string => {
    return metadata?.tags.find((t) => t.id === id)?.name || `Tag #${id}`;
  };

  const getTypeName = (id: number | null): string => {
    if (id === null) return "-";
    return metadata?.documentTypes.find((t) => t.id === id)?.name || `Typ #${id}`;
  };

  const getCorrespondentName = (id: number | null): string => {
    if (id === null) return "-";
    return metadata?.correspondents.find((c) => c.id === id)?.name || `Korrespondent #${id}`;
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  // Feature disabled
  if (flagsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!flags.paperless) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <FileArchive className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">{t("notActivatedTitle")}</h2>
        <p className="text-muted-foreground max-w-md">
          {t("notActivatedDescription")}
        </p>
      </div>
    );
  }

  function handleDownload(docId: number, filename: string) {
    const link = document.createElement("a");
    link.href = `/api/integrations/paperless/documents/${docId}/download`;
    link.download = filename;
    link.click();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button
            variant="outline"
            onClick={() => {
              setPage(1);
              setLoading(true);
              // Re-trigger useEffect
              setSearch((s) => s + " ");
              setTimeout(() => setSearch((s) => s.trimEnd()), 10);
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("refresh")}
          </Button>
        }
      />

      {/* Search & Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileArchive className="h-5 w-5" />
            {t("searchTitle")}
          </CardTitle>
          <CardDescription>
            {t("documentCount", { count: totalCount })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center mb-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-8"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Tag Filter */}
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="w-[180px]">
                <Tag className="mr-2 h-4 w-4" />
                <SelectValue placeholder={t("tableTags")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allTags")}</SelectItem>
                {metadata?.tags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id.toString()}>
                    {tag.name} ({tag.document_count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Type Filter */}
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder={t("tableDocType")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allTypes")}</SelectItem>
                {metadata?.documentTypes.map((dt) => (
                  <SelectItem key={dt.id} value={dt.id.toString()}>
                    {dt.name} ({dt.document_count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Correspondent Filter */}
            <Select value={correspondentFilter} onValueChange={setCorrespondentFilter}>
              <SelectTrigger className="w-[200px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder={t("tableCorrespondent")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allCorrespondents")}</SelectItem>
                {metadata?.correspondents.map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    {c.name} ({c.document_count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("tableTitle")}</TableHead>
                  <TableHead>{t("tableDocType")}</TableHead>
                  <TableHead>{t("tableCorrespondent")}</TableHead>
                  <TableHead>{t("tableTags")}</TableHead>
                  <TableHead>{t("tableCreated")}</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-24" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : documents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      {t("noDocuments")}
                    </TableCell>
                  </TableRow>
                ) : (
                  documents.map((doc) => (
                    <TableRow
                      key={doc.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        setSelectedDoc(doc);
                        setDetailOpen(true);
                      }}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div>
                            <p className="font-medium">{doc.title}</p>
                            <p className="text-sm text-muted-foreground">
                              {doc.original_file_name}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{getTypeName(doc.document_type)}</TableCell>
                      <TableCell>{getCorrespondentName(doc.correspondent)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {doc.tags.slice(0, 3).map((tagId) => (
                            <Badge key={tagId} variant="secondary" className="text-xs">
                              {getTagName(tagId)}
                            </Badge>
                          ))}
                          {doc.tags.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{doc.tags.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {doc.created_date
                          ? format(new Date(doc.created_date), "dd.MM.yyyy", { locale: de })
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title={t("preview")}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDoc(doc);
                              setDetailOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title={t("download")}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(doc.id, doc.original_file_name);
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {t("pagination", {
                  from: (page - 1) * pageSize + 1,
                  to: Math.min(page * pageSize, totalCount),
                  total: totalCount,
                })}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {tCommon("back")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {tCommon("next")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Document Detail Sheet */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          {selectedDoc && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {selectedDoc.title}
                </SheetTitle>
                <SheetDescription>{selectedDoc.original_file_name}</SheetDescription>
              </SheetHeader>

              <div className="space-y-6 mt-6">
                {/* Preview */}
                <div>
                  <h4 className="text-sm font-medium mb-2">{t("previewTitle")}</h4>
                  <div className="border rounded-lg overflow-hidden bg-muted min-h-[200px] flex items-center justify-center">
                    {previewLoading ? (
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    ) : previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previewUrl}
                        alt={t("previewAlt", { title: selectedDoc.title })}
                        className="max-w-full h-auto"
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">{t("noPreview")}</p>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">{t("metaDocType")}</p>
                    <p className="font-medium">{getTypeName(selectedDoc.document_type)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t("metaCorrespondent")}</p>
                    <p className="font-medium">{getCorrespondentName(selectedDoc.correspondent)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t("metaCreated")}</p>
                    <p className="font-medium">
                      {selectedDoc.created_date
                        ? format(new Date(selectedDoc.created_date), "dd.MM.yyyy", { locale: de })
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t("metaAdded")}</p>
                    <p className="font-medium">
                      {format(new Date(selectedDoc.added), "dd.MM.yyyy HH:mm", { locale: de })}
                    </p>
                  </div>
                  {selectedDoc.archive_serial_number && (
                    <div>
                      <p className="text-muted-foreground">{t("metaASN")}</p>
                      <p className="font-medium">#{selectedDoc.archive_serial_number}</p>
                    </div>
                  )}
                </div>

                {/* Tags */}
                {selectedDoc.tags.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">{t("tableTags")}</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedDoc.tags.map((tagId) => (
                        <Badge key={tagId} variant="secondary">
                          {getTagName(tagId)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Content snippet */}
                {selectedDoc.content && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">{t("contentExcerpt")}</p>
                    <p className="text-sm bg-muted p-3 rounded-md max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                      {selectedDoc.content.slice(0, 1000)}
                      {selectedDoc.content.length > 1000 && "..."}
                    </p>
                  </div>
                )}

                <Separator />

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleDownload(selectedDoc.id, selectedDoc.original_file_name)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {t("download")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Open in Paperless UI
                      window.open(
                        `/api/integrations/paperless/documents/${selectedDoc.id}?redirect=true`,
                        "_blank"
                      );
                    }}
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {t("openInPaperless")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
