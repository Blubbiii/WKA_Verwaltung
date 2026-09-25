"use client";

/**
 * Header actions of a detail page, one pattern everywhere:
 * extra actions (children) · "Bearbeiten" · "…" menu with further actions and,
 * separated at the bottom, "Löschen" — always behind a confirmation.
 */

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";

interface DetailAktionenProps {
  /** Link to the edit page — or use onEdit for a dialog. */
  editHref?: string;
  onEdit?: () => void;
  /** Deletes the record; throw to keep the dialog open. Omit when not allowed. */
  onDelete?: () => Promise<void> | void;
  deleteItemName?: string;
  deleteDescription?: string;
  /** Further DropdownMenuItems, shown above "Löschen". */
  menuItems?: ReactNode;
  /** Visible actions left of "Bearbeiten" (e.g. the primary action). */
  children?: ReactNode;
  disabled?: boolean;
}

export function DetailAktionen({
  editHref,
  onEdit,
  onDelete,
  deleteItemName,
  deleteDescription,
  menuItems,
  children,
  disabled,
}: DetailAktionenProps) {
  const t = useTranslations("common.detailActions");
  const [loeschenOffen, setLoeschenOffen] = useState(false);
  const hatMenue = !!menuItems || !!onDelete;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {children}
      {editHref ? (
        <Button variant="outline" asChild>
          <Link href={editHref}>
            <Pencil className="mr-2 h-4 w-4" />
            {t("edit")}
          </Link>
        </Button>
      ) : onEdit ? (
        <Button variant="outline" onClick={onEdit} disabled={disabled}>
          <Pencil className="mr-2 h-4 w-4" />
          {t("edit")}
        </Button>
      ) : null}
      {hatMenue && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label={t("more")} disabled={disabled}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {menuItems}
            {menuItems && onDelete && <DropdownMenuSeparator />}
            {onDelete && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setLoeschenOffen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t("delete")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {onDelete && (
        <DeleteConfirmDialog
          open={loeschenOffen}
          onOpenChange={setLoeschenOffen}
          onConfirm={onDelete}
          itemName={deleteItemName}
          description={deleteDescription}
        />
      )}
    </div>
  );
}
