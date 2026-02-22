"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  FileText,
  File,
  FileSpreadsheet,
  FileImage,
  Loader2,
  ArrowRight,
  Clock,
  Tag,
  FolderOpen,
} from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface SearchResult {
  id: string;
  title: string;
  description: string | null;
  category: string;
  fileName: string;
  mimeType: string | null;
  tags: string[];
  park: { id: string; name: string; shortName: string | null } | null;
  fund: { id: string; name: string } | null;
  createdAt: string;
  relevanceScore: number;
  highlights: { field: string; snippet: string }[];
}

interface DocumentSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return File;
  if (mimeType.includes("pdf")) return FileText;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
    return FileSpreadsheet;
  if (mimeType.includes("image")) return FileImage;
  return File;
}

export function DocumentSearchDialog({
  open,
  onOpenChange,
}: DocumentSearchDialogProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const debouncedQuery = useDebounce(query, 200);

  // Load recent searches from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("documentSearchHistory");
    if (stored) {
      try {
        setRecentSearches(JSON.parse(stored).slice(0, 5));
      } catch {
        // Ignore parse errors
      }
    }
  }, []);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      // Reset state when opening
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [open]);

  // Perform search when debounced query changes
  useEffect(() => {
    async function search() {
      if (!debouncedQuery || debouncedQuery.length < 2) {
        setResults([]);
        setTotalCount(0);
        return;
      }

      setLoading(true);
      try {
        const params = new URLSearchParams({
          q: debouncedQuery,
          limit: "10",
          sortBy: "relevance",
        });

        const response = await fetch(`/api/documents/search?${params}`);
        if (!response.ok) {
          throw new Error("Search failed");
        }

        const data = await response.json();
        setResults(data.data);
        setTotalCount(data.pagination.total);
        setSelectedIndex(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }

    search();
  }, [debouncedQuery]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (results.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % results.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
          break;
        case "Enter":
          e.preventDefault();
          if (results[selectedIndex]) {
            navigateToDocument(results[selectedIndex].id);
          }
          break;
        case "Escape":
          e.preventDefault();
          onOpenChange(false);
          break;
      }
    },
    [results, selectedIndex, onOpenChange]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current && results.length > 0) {
      const selectedElement = resultsRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex, results.length]);

  function navigateToDocument(documentId: string) {
    // Save search to history
    if (query) {
      const newHistory = [query, ...recentSearches.filter((s) => s !== query)].slice(0, 5);
      localStorage.setItem("documentSearchHistory", JSON.stringify(newHistory));
      setRecentSearches(newHistory);
    }

    onOpenChange(false);
    router.push(`/documents/${documentId}`);
  }

  function handleRecentSearchClick(searchTerm: string) {
    setQuery(searchTerm);
  }

  // Render highlighted text with <mark> tags
  function renderHighlightedText(text: string) {
    const parts = text.split(/(<mark>|<\/mark>)/);
    let inMark = false;

    return parts.map((part, index) => {
      if (part === "<mark>") {
        inMark = true;
        return null;
      }
      if (part === "</mark>") {
        inMark = false;
        return null;
      }
      if (inMark) {
        return (
          <span key={index} className="bg-yellow-200 text-yellow-900 rounded px-0.5">
            {part}
          </span>
        );
      }
      return part;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        {/* Search Input Header */}
        <div className="flex items-center border-b px-4 py-3">
          <Search className="h-5 w-5 text-muted-foreground mr-3 shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Dokumente durchsuchen..."
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 text-base"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-2" />}
        </div>

        {/* Results Area */}
        <div className="max-h-[400px] overflow-y-auto">
          {/* Recent Searches (when no query) */}
          {!query && recentSearches.length > 0 && (
            <div className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                <Clock className="h-3 w-3" />
                Letzte Suchen
              </p>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((term, index) => (
                  <button
                    key={index}
                    onClick={() => handleRecentSearchClick(term)}
                    className="text-sm px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 transition-colors"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* No Query State */}
          {!query && recentSearches.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">Schnellsuche</p>
              <p className="text-sm mt-1">
                Geben Sie mindestens 2 Zeichen ein, um Dokumente zu finden
              </p>
            </div>
          )}

          {/* Loading State */}
          {query && loading && results.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" />
              <p>Suche laeuft...</p>
            </div>
          )}

          {/* No Results */}
          {query && !loading && results.length === 0 && query.length >= 2 && (
            <div className="p-8 text-center text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">Keine Ergebnisse</p>
              <p className="text-sm mt-1">
                Keine Dokumente gefunden fuer &quot;{query}&quot;
              </p>
            </div>
          )}

          {/* Query too short */}
          {query && query.length < 2 && (
            <div className="p-8 text-center text-muted-foreground">
              <p className="text-sm">
                Bitte geben Sie mindestens 2 Zeichen ein
              </p>
            </div>
          )}

          {/* Search Results */}
          {results.length > 0 && (
            <>
              <div className="px-4 py-2 border-b bg-muted/30">
                <p className="text-xs text-muted-foreground">
                  {totalCount} {totalCount === 1 ? "Ergebnis" : "Ergebnisse"}
                  {totalCount > 10 && " (zeige Top 10)"}
                </p>
              </div>
              <div ref={resultsRef} className="py-2">
                {results.map((result, index) => {
                  const FileIcon = getFileIcon(result.mimeType);
                  const catConfig = categoryConfig[result.category];
                  const titleHighlight = result.highlights.find((h) => h.field === "title");
                  const descHighlight = result.highlights.find((h) => h.field === "description");

                  return (
                    <button
                      key={result.id}
                      onClick={() => navigateToDocument(result.id)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={cn(
                        "w-full px-4 py-3 flex items-start gap-3 text-left transition-colors",
                        selectedIndex === index
                          ? "bg-accent"
                          : "hover:bg-muted/50"
                      )}
                    >
                      <FileIcon className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {titleHighlight
                              ? renderHighlightedText(titleHighlight.snippet)
                              : result.title}
                          </span>
                          <Badge variant="secondary" className={cn("shrink-0 text-xs", catConfig?.color)}>
                            {catConfig?.label || result.category}
                          </Badge>
                        </div>
                        {descHighlight && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {renderHighlightedText(descHighlight.snippet)}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                          <span className="truncate">{result.fileName}</span>
                          {result.park && (
                            <span className="shrink-0">
                              {result.park.shortName || result.park.name}
                            </span>
                          )}
                          <span className="shrink-0">
                            {format(new Date(result.createdAt), "dd.MM.yyyy", { locale: de })}
                          </span>
                        </div>
                        {result.tags.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <Tag className="h-3 w-3 text-muted-foreground" />
                            {result.tags.slice(0, 3).map((tag, tagIndex) => (
                              <span
                                key={tagIndex}
                                className="text-xs px-1.5 py-0.5 rounded bg-muted"
                              >
                                {tag}
                              </span>
                            ))}
                            {result.tags.length > 3 && (
                              <span className="text-xs text-muted-foreground">
                                +{result.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer with keyboard shortcuts */}
        <div className="border-t px-4 py-2 bg-muted/30 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px]">Enter</kbd>
              oeffnen
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px]">Esc</kbd>
              schliessen
            </span>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px]">&#8593;</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-muted border text-[10px]">&#8595;</kbd>
            navigieren
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
