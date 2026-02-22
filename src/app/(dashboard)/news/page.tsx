"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useDebounce } from "@/hooks/useDebounce";
import {
  Newspaper,
  Search,
  Plus,
  Calendar,
  Building2,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Filter,
  CheckCircle,
  Clock,
  Send,
  Tag,
} from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { StatsCards } from "@/components/ui/stats-cards";

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  GENERAL: { label: "Allgemein", color: "bg-gray-100 text-gray-800" },
  FINANCIAL: { label: "Finanziell", color: "bg-blue-100 text-blue-800" },
  TECHNICAL: { label: "Technisch", color: "bg-purple-100 text-purple-800" },
  LEGAL: { label: "Rechtlich", color: "bg-orange-100 text-orange-800" },
};

const NEWS_CATEGORIES = [
  { value: "GENERAL", label: "Allgemein" },
  { value: "FINANCIAL", label: "Finanziell" },
  { value: "TECHNICAL", label: "Technisch" },
  { value: "LEGAL", label: "Rechtlich" },
];

interface NewsItem {
  id: string;
  title: string;
  content: string;
  category: string;
  isPublished: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  fund: {
    id: string;
    name: string;
  } | null;
  createdBy: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

interface Fund {
  id: string;
  name: string;
}

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [publishedFilter, setPublishedFilter] = useState<string>("_all");
  const [fundFilter, setFundFilter] = useState<string>("_all");
  const [categoryFilter, setCategoryFilter] = useState<string>("_all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  useEffect(() => {
    async function loadFunds() {
      try {
        const response = await fetch("/api/funds");
        if (response.ok) {
          const data = await response.json();
          setFunds(data.data || []);
        }
      } catch {
      }
    }
    loadFunds();
  }, []);

  useEffect(() => {
    async function loadNews() {
      try {
        setIsLoading(true);
        const params = new URLSearchParams();
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (publishedFilter && publishedFilter !== "_all")
          params.set("published", publishedFilter);
        if (fundFilter && fundFilter !== "_all") params.set("fundId", fundFilter);
        if (categoryFilter && categoryFilter !== "_all") params.set("category", categoryFilter);
        params.set("page", pagination.page.toString());
        params.set("limit", pagination.limit.toString());

        const response = await fetch(`/api/news?${params.toString()}`);
        if (response.ok) {
          const data = await response.json();
          setNews(data.data || []);
          setPagination((prev) => ({
            ...prev,
            total: data.pagination?.total || 0,
            totalPages: data.pagination?.totalPages || 0,
          }));
        }
      } catch {
      } finally {
        setIsLoading(false);
      }
    }

    loadNews();
  }, [debouncedSearch, publishedFilter, fundFilter, categoryFilter, pagination.page, pagination.limit]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getAuthorName = (author: NewsItem["createdBy"]) => {
    if (!author) return "System";
    return `${author.firstName || ""} ${author.lastName || ""}`.trim() || "Unbekannt";
  };

  // Strip HTML tags and truncate content for preview
  const stripHtmlAndTruncate = useMemo(() => {
    return (content: string, maxLength: number = 150) => {
      // Remove HTML tags
      const stripped = content.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ");
      if (stripped.length <= maxLength) return stripped;
      return stripped.substring(0, maxLength).trim() + "...";
    };
  }, []);

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const response = await fetch(`/api/news/${deleteId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setNews((prev) => prev.filter((n) => n.id !== deleteId));
        setPagination((prev) => ({ ...prev, total: prev.total - 1 }));
      }
    } catch {
    } finally {
      setDeleteId(null);
    }
  };

  const handlePublish = async (id: string, isPublished: boolean) => {
    try {
      const response = await fetch(`/api/news/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished }),
      });

      if (response.ok) {
        const updated = await response.json();
        setNews((prev) =>
          prev.map((n) =>
            n.id === id
              ? { ...n, isPublished: updated.isPublished, publishedAt: updated.publishedAt }
              : n
          )
        );
      }
    } catch {
    }
  };

  const publishedCount = news.filter((n) => n.isPublished).length;
  const draftCount = news.filter((n) => !n.isPublished).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meldungen"
        description="Verwalten Sie Neuigkeiten und Ankündigungen für Ihre Gesellschafter"
        createHref="/news/new"
        createLabel="Neue Meldung"
      />

      {/* Statistics */}
      <StatsCards
        columns={3}
        stats={[
          { label: "Gesamtanzahl", value: pagination.total, icon: Newspaper, subtitle: "Meldungen insgesamt" },
          { label: "Veröffentlicht", value: publishedCount, icon: CheckCircle, iconClassName: "text-green-500", subtitle: "aktive Meldungen" },
          { label: "Entwürfe", value: draftCount, icon: Clock, iconClassName: "text-yellow-500", subtitle: "noch nicht veröffentlicht" },
        ]}
      />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Nach Titel oder Inhalt suchen..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={fundFilter} onValueChange={setFundFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Alle Gesellschaften" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Alle Gesellschaften</SelectItem>
                {funds.map((fund) => (
                  <SelectItem key={fund.id} value={fund.id}>
                    {fund.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={publishedFilter} onValueChange={setPublishedFilter}>
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="Alle Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Alle Status</SelectItem>
                <SelectItem value="true">Veröffentlicht</SelectItem>
                <SelectItem value="false">Entwurf</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="Alle Kategorien" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Alle Kategorien</SelectItem>
                {NEWS_CATEGORIES.map((category) => (
                  <SelectItem key={category.value} value={category.value}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* News List */}
      <div className="space-y-4">
        {isLoading ? (
          [...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-4 w-1/4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))
        ) : news.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Newspaper className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">Keine Meldungen gefunden</h3>
              <p className="text-muted-foreground mt-2">
                {search || fundFilter !== "_all" || publishedFilter !== "_all" || categoryFilter !== "_all"
                  ? "Versuchen Sie andere Filterkriterien."
                  : "Erstellen Sie Ihre erste Meldung."}
              </p>
              {!search && fundFilter === "_all" && publishedFilter === "_all" && categoryFilter === "_all" && (
                <Link href="/news/new" className="mt-4">
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Neue Meldung
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        ) : (
          news.map((item) => (
            <Card key={item.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-xl">
                        <Link
                          href={`/news/${item.id}`}
                          className="hover:underline"
                        >
                          {item.title}
                        </Link>
                      </CardTitle>
                      <Badge
                        variant={item.isPublished ? "default" : "secondary"}
                        className={
                          item.isPublished
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }
                      >
                        {item.isPublished ? "Veröffentlicht" : "Entwurf"}
                      </Badge>
                      {item.category && CATEGORY_LABELS[item.category] && (
                        <Badge
                          variant="outline"
                          className={CATEGORY_LABELS[item.category].color}
                        >
                          {CATEGORY_LABELS[item.category].label}
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="flex items-center gap-4">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {item.isPublished && item.publishedAt
                          ? `Veröffentlicht am ${formatDate(item.publishedAt)}`
                          : `Erstellt am ${formatDate(item.createdAt)}`}
                      </span>
                      {item.fund && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {item.fund.name}
                        </span>
                      )}
                      <span>von {getAuthorName(item.createdBy)}</span>
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Anzeigen"
                      asChild
                    >
                      <Link href={`/news/${item.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Bearbeiten"
                      asChild
                    >
                      <Link href={`/news/${item.id}/edit`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Weitere Aktionen">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {item.isPublished ? (
                          <DropdownMenuItem
                            onClick={() => handlePublish(item.id, false)}
                          >
                            <Clock className="mr-2 h-4 w-4" />
                            Zurueck zu Entwurf
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => handlePublish(item.id, true)}
                          >
                            <Send className="mr-2 h-4 w-4" />
                            Veroeffentlichen
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => setDeleteId(item.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Loeschen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  {stripHtmlAndTruncate(item.content)}
                </p>
                {item.expiresAt && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Läuft ab: {formatDate(item.expiresAt)}
                  </p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Seite {pagination.page} von {pagination.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page === 1}
              onClick={() =>
                setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
              }
            >
              Zurück
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page === pagination.totalPages}
              onClick={() =>
                setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
              }
            >
              Weiter
            </Button>
          </div>
        </div>
      )}

      {/* Delete Dialog */}
      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        onConfirm={handleDelete}
        title="Meldung loeschen"
      />
    </div>
  );
}
