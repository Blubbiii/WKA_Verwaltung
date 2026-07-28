"use client";

/**
 * NewFundDialog — Inline-Dialog zur schnellen Fund-Anlage aus Add/Edit-Turbine
 * heraus. War in Add + Edit identisch dupliziert (~50 LOC pro Copy).
 *
 * Als Sibling zum Turbine-Dialog gerendert (nicht als Kind), um Nested-Dialog-
 * Portal-Konflikte zu vermeiden.
 */

import type { Dispatch, SetStateAction } from "react";
import { Loader2 } from "lucide-react";
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
import type { FundCategory } from "./useTurbineForm";

interface NewFundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  legalForm: string;
  setLegalForm: Dispatch<SetStateAction<string>>;
  categoryId: string;
  setCategoryId: Dispatch<SetStateAction<string>>;
  fundCategories: FundCategory[];
  isSubmitting: boolean;
  onSubmit: () => void;
}

export function NewFundDialog({
  open,
  onOpenChange,
  name,
  setName,
  legalForm,
  setLegalForm,
  categoryId,
  setCategoryId,
  fundCategories,
  isSubmitting,
  onSubmit,
}: NewFundDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Neue Gesellschaft anlegen</DialogTitle>
          <DialogDescription>
            Schnell eine neue Gesellschaft erstellen
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input
              placeholder="z.B. Netz GbR Windpark Nord"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Rechtsform</Label>
            <Input
              placeholder="z.B. GbR, GmbH & Co. KG"
              value={legalForm}
              onChange={(e) => setLegalForm(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Gesellschaftstyp</Label>
            <select
              className="flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Typ waehlen...</option>
              {fundCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} ({category.code})
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting || !name.trim()}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Erstellen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
