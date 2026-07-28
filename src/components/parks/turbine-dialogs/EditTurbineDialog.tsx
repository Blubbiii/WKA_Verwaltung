"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Turbine } from "./types";
import { deviceTypeLabels } from "./types";
import { useTurbineForm } from "./useTurbineForm";
import { TurbineFormFields } from "./TurbineFormFields";
import { NewFundDialog } from "./NewFundDialog";

interface EditTurbineDialogProps {
  turbine: Turbine | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditTurbineDialog({
  turbine,
  isOpen,
  setIsOpen,
  onSuccess,
}: EditTurbineDialogProps) {
  const t = useTranslations("parks.turbineDialog");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useTurbineForm(turbine);

  async function handleSubmit() {
    if (!turbine || !form.formData.designation.trim()) {
      toast.error(t("validation.designationRequired"));
      return;
    }
    try {
      setIsSubmitting(true);
      const response = await fetch(`/api/turbines/${turbine.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form.buildSubmitPayload()),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t("toast.saveError"));
      }
      toast.success(t("toast.turbineUpdated"));
      setIsOpen(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toast.saveError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!turbine) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Anlage bearbeiten
              {turbine.deviceType && turbine.deviceType !== "WEA" && (
                <Badge variant="outline" className="text-xs font-normal">
                  {deviceTypeLabels[turbine.deviceType] || turbine.deviceType}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>{turbine.designation} bearbeiten</DialogDescription>
          </DialogHeader>
          <TurbineFormFields
            idPrefix="edit"
            formData={form.formData}
            setFormData={form.setFormData}
            commissioningDate={form.commissioningDate}
            setCommissioningDate={form.setCommissioningDate}
            warrantyEndDate={form.warrantyEndDate}
            setWarrantyEndDate={form.setWarrantyEndDate}
            commissioningDateText={form.commissioningDateText}
            setCommissioningDateText={form.setCommissioningDateText}
            warrantyEndDateText={form.warrantyEndDateText}
            setWarrantyEndDateText={form.setWarrantyEndDateText}
            funds={form.funds}
            onCreateNewFund={(target) => {
              form.setFundCreationTarget(target);
              form.setShowNewFundDialog(true);
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !form.formData.designation.trim()}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewFundDialog
        open={form.showNewFundDialog}
        onOpenChange={form.setShowNewFundDialog}
        name={form.newFundName}
        setName={form.setNewFundName}
        legalForm={form.newFundLegalForm}
        setLegalForm={form.setNewFundLegalForm}
        categoryId={form.newFundCategoryId}
        setCategoryId={form.setNewFundCategoryId}
        fundCategories={form.fundCategories}
        isSubmitting={form.isCreatingFund}
        onSubmit={form.handleCreateFund}
      />
    </>
  );
}
