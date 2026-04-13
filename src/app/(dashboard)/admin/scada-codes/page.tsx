"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Upload,
  Eye,
  Trash2,
  Loader2,
  Search,
  Database,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useTranslations } from "next-intl";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CodeGroup {
  controllerType: string;
  codeCount: number;
  lastUpdated: string | null;
}

interface StatusCode {
  id: string;
  mainCode: number;
  subCode: number;
  description: string;
  parentLabel: string | null;
  timeKey: string | null;
  messageType: string;
  codeType: string;
}

interface CodeGroupDetail {
  mainCode: number;
  parentLabel: string | null;
  codes: StatusCode[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Message type labels moved to i18n

const MESSAGE_TYPE_COLORS: Record<string, string> = {
  S: "default",
  W: "secondary",
  I: "outline",
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScadaCodesPage() {
  const t = useTranslations("admin.scadaCodes");
  // --- Overview state ---
  const [groups, setGroups] = useState<CodeGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // --- Import dialog state ---
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importControllerType, setImportControllerType] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Detail view state ---
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [detailGroups, setDetailGroups] = useState<CodeGroupDetail[]>([]);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  // --- Delete state ---
  const [deleteType, setDeleteType] = useState<string | null>(null);

  // --- Load overview ---
  const loadGroups = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/scada-codes");
      if (!res.ok) throw new Error(t("loadError"));
      const json = await res.json();
      setGroups(json.data || []);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  // --- Load detail ---
  const loadDetail = useCallback(
    async (controllerType: string, search?: string) => {
      try {
        setDetailLoading(true);
        const params = new URLSearchParams();
        if (search) params.set("search", search);
        const res = await fetch(
          `/api/admin/scada-codes/${encodeURIComponent(controllerType)}?${params}`
        );
        if (!res.ok) throw new Error(t("loadError"));
        const json = await res.json();
        setDetailGroups(json.groups || []);
        setDetailTotal(json.totalCodes || 0);
        // Expand all groups by default
        const allMains = new Set<number>(
          (json.groups || []).map((g: CodeGroupDetail) => g.mainCode)
        );
        setExpandedGroups(allMains);
      } catch {
        toast.error(t("loadDetailError"));
      } finally {
        setDetailLoading(false);
      }
    },
    [t]
  );

  // --- Handlers ---

  const handleViewDetail = (controllerType: string) => {
    setSelectedType(controllerType);
    setSearchQuery("");
    loadDetail(controllerType);
  };

  const handleSearch = () => {
    if (selectedType) {
      loadDetail(selectedType, searchQuery);
    }
  };

  const handleImport = async () => {
    if (!importFile) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      if (importControllerType.trim()) {
        formData.append("controllerType", importControllerType.trim());
      }

      const res = await fetch("/api/admin/scada-codes/import", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import fehlgeschlagen");

      toast.success(t("importSuccess", { count: json.imported, type: json.controllerType }));
      setImportOpen(false);
      setImportFile(null);
      setImportControllerType("");
      loadGroups();

      // Refresh detail if viewing the same type
      if (selectedType === json.controllerType) {
        loadDetail(json.controllerType, searchQuery);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("importFailed")
      );
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteType) return;
    try {
      const res = await fetch(
        `/api/admin/scada-codes?controllerType=${encodeURIComponent(deleteType)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Löschen fehlgeschlagen");
      const json = await res.json();
      toast.success(t("deleteSuccess", { count: json.deleted, type: deleteType }));
      setDeleteType(null);
      loadGroups();
      if (selectedType === deleteType) {
        setSelectedType(null);
        setDetailGroups([]);
      }
    } catch {
      toast.error(t("deleteError"));
    }
  };

  const toggleGroup = (mainCode: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(mainCode)) {
        next.delete(mainCode);
      } else {
        next.add(mainCode);
      }
      return next;
    });
  };

  // --- Render ---

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            {t("importBtn")}
          </Button>
        }
      />

      {/* Overview table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Database className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">
                {t("noGroups")}
              </p>
              <p className="text-sm mt-1">
                {t("importHint")}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colControllerType")}</TableHead>
                  <TableHead className="text-right">{t("colCodes")}</TableHead>
                  <TableHead>{t("colUpdated")}</TableHead>
                  <TableHead className="text-right">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.controllerType}>
                    <TableCell className="font-medium">
                      {group.controllerType}
                    </TableCell>
                    <TableCell className="text-right">
                      {group.codeCount.toLocaleString("de-DE")}
                    </TableCell>
                    <TableCell>{formatDate(group.lastUpdated)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetail(group.controllerType)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteType(group.controllerType)}
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

      {/* Detail view */}
      {selectedType && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {selectedType}{" "}
                <span className="text-muted-foreground font-normal text-sm">
                  ({detailTotal.toLocaleString("de-DE")} Codes)
                </span>
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedType(null)}
              >
                Schliessen
              </Button>
            </div>

            {/* Search */}
            <div className="flex gap-2 mb-4">
              <Input
                placeholder={t("searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="max-w-sm"
              />
              <Button variant="outline" size="sm" onClick={handleSearch}>
                <Search className="h-4 w-4" />
              </Button>
            </div>

            {detailLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : detailGroups.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4">
                {t("noCodes")}
              </p>
            ) : (
              <div className="space-y-2">
                {detailGroups.map((group) => (
                  <div
                    key={group.mainCode}
                    className="border rounded-lg overflow-hidden"
                  >
                    {/* Group header */}
                    <button
                      className="w-full flex items-center gap-2 px-4 py-2 bg-muted/50 hover:bg-muted text-left text-sm font-medium"
                      onClick={() => toggleGroup(group.mainCode)}
                    >
                      {expandedGroups.has(group.mainCode) ? (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
                      <span className="text-muted-foreground">
                        ${group.mainCode}
                      </span>
                      <span>{group.parentLabel || "—"}</span>
                      <span className="text-muted-foreground ml-auto">
                        {t("entries", { count: group.codes.length })}
                      </span>
                    </button>

                    {/* Group codes */}
                    {expandedGroups.has(group.mainCode) && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-20">{t("colCode")}</TableHead>
                            <TableHead>{t("colDesc")}</TableHead>
                            <TableHead className="w-16">{t("colTime")}</TableHead>
                            <TableHead className="w-28">{t("colType")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.codes.map((code) => (
                            <TableRow key={code.id}>
                              <TableCell className="font-mono text-xs">
                                ${code.subCode}
                              </TableCell>
                              <TableCell className="text-sm">
                                {code.description}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {code.timeKey || "—"}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    (MESSAGE_TYPE_COLORS[code.messageType] ||
                                      "default") as
                                      | "default"
                                      | "secondary"
                                      | "outline"
                                  }
                                >
                                  {code.messageType === "S" ? t("msgStatus") : code.messageType === "W" ? t("msgWarning") : code.messageType === "I" ? t("msgInfo") : code.messageType}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("importTitle")}</DialogTitle>
            <DialogDescription>
              {t("importDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="xlsx-file">{t("xlsxFile")}</Label>
              <Input
                id="xlsx-file"
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="controller-type">{t("controllerType")}</Label>
              <Input
                id="controller-type"
                placeholder={t("controllerTypePlaceholder")}
                value={importControllerType}
                onChange={(e) => setImportControllerType(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {t("controllerTypeHint")}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleImport} disabled={!importFile || importing}>
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Importieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <DeleteConfirmDialog
        open={!!deleteType}
        onOpenChange={(open) => !open && setDeleteType(null)}
        onConfirm={handleDelete}
        title={t("deleteTitle")}
        description={t("deleteDescription", { type: deleteType || "" })}
      />
    </div>
  );
}
