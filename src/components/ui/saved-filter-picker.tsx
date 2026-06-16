"use client";

/**
 * SavedFilterPicker — B6: Saved Filters in Tabellen
 *
 * Dropdown mit verfügbaren Saved-Filters für eine Tabellen-Surface +
 * "Aktuellen Filter speichern" Button mit Mini-Dialog.
 *
 * Usage:
 * <SavedFilterPicker
 *   surface="auditLogs"
 *   currentFilters={{ action: "DELETE", userId: "..." }}
 *   onApply={(filters) => { ... }}
 * />
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Bookmark, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import { useSavedFilters, type SavedFilter } from "@/hooks/useSavedFilters";

interface SavedFilterPickerProps {
  /** Identifier for the table surface, e.g. "auditLogs", "invoices". */
  surface: string;
  /** The current filter state (will be persisted when user clicks "save current"). */
  currentFilters: Record<string, unknown>;
  /** Called when the user picks a saved filter — caller applies the payload. */
  onApply: (filters: Record<string, unknown>) => void;
}

export function SavedFilterPicker({ surface, currentFilters, onApply }: SavedFilterPickerProps) {
  const t = useTranslations("common.savedFilters");
  const { filters, save, update, remove, isLoading, isSaving } = useSavedFilters(surface);

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [setDefaultOnSave, setSetDefaultOnSave] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SavedFilter | null>(null);

  async function handleSaveCurrent() {
    if (!nameInput.trim()) return;
    try {
      await save({
        name: nameInput.trim(),
        filters: currentFilters,
        isDefault: setDefaultOnSave,
      });
      toast.success(t("savedToast", { name: nameInput.trim() }));
      setSaveDialogOpen(false);
      setNameInput("");
      setSetDefaultOnSave(false);
    } catch {
      toast.error(t("saveError"));
    }
  }

  async function handleToggleDefault(filter: SavedFilter) {
    try {
      await update(filter.id, { isDefault: !filter.isDefault });
    } catch {
      toast.error(t("updateError"));
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await remove(deleteTarget.id);
      toast.success(t("deletedToast", { name: deleteTarget.name }));
      setDeleteTarget(null);
    } catch {
      toast.error(t("deleteError"));
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isLoading}>
            <Bookmark className="h-4 w-4 mr-2" />
            {t("dropdown")}
            {filters.length > 0 && (
              <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-xs">
                {filters.length}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>{t("dropdown")}</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {filters.length === 0 && (
            <div className="px-2 py-3 text-sm text-muted-foreground text-center">
              {t("empty")}
            </div>
          )}

          {filters.map((filter) => (
            <div
              key={filter.id}
              className="flex items-center gap-1 px-1 py-0.5 hover:bg-accent rounded-sm"
            >
              <button
                type="button"
                onClick={() => onApply(filter.filters)}
                className="flex-1 text-left px-2 py-1.5 text-sm rounded-sm flex items-center gap-2 min-w-0"
              >
                {filter.isDefault && (
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />
                )}
                <span className="truncate">{filter.name}</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleToggleDefault(filter);
                }}
                className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title={t("setDefault")}
                aria-label={t("setDefault")}
              >
                <Star
                  className={`h-3.5 w-3.5 ${
                    filter.isDefault ? "fill-amber-400 text-amber-400" : ""
                  }`}
                />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDeleteTarget(filter);
                }}
                className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title={t("deleteHint")}
                aria-label={t("deleteHint")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setSaveDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {t("saveCurrent")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Save current filter dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("saveCurrent")}</DialogTitle>
            <DialogDescription>{t("saveDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="saved-filter-name">{t("nameLabel")}</Label>
              <Input
                id="saved-filter-name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder={t("namePlaceholder")}
                autoFocus
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={setDefaultOnSave}
                onChange={(e) => setSetDefaultOnSave(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              {t("setDefault")}
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSaveDialogOpen(false);
                setNameInput("");
                setSetDefaultOnSave(false);
              }}
              disabled={isSaving}
            >
              {t("cancel")}
            </Button>
            <Button
              onClick={handleSaveCurrent}
              disabled={!nameInput.trim() || isSaving}
            >
              {isSaving ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? t("confirmDelete", { name: deleteTarget.name })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
