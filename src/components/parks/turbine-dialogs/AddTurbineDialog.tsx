"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTurbineForm } from "./useTurbineForm";
import { TurbineFormFields } from "./TurbineFormFields";
import { NewFundDialog } from "./NewFundDialog";

interface AddTurbineDialogProps {
  parkId: string;
  parkName: string;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddTurbineDialog({
  parkId,
  parkName,
  isOpen,
  setIsOpen,
  onSuccess,
}: AddTurbineDialogProps) {
  const t = useTranslations("parks.turbineDialog");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useTurbineForm();

  async function handleSubmit() {
    if (!form.formData.designation.trim()) {
      toast.error(t("validation.designationRequired"));
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch("/api/turbines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parkId, ...form.buildSubmitPayload() }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t("toast.createError"));
      }

      toast.success(t("toast.turbineCreated"));
      form.resetForm();
      setIsOpen(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toast.createError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) form.resetForm();
          setIsOpen(open);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Neue Anlage hinzufügen</DialogTitle>
            <DialogDescription>
              Neue Windkraftanlage für {parkName} erstellen
            </DialogDescription>
          </DialogHeader>
          <TurbineFormFields
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
            <Button
              variant="outline"
              onClick={() => {
                form.resetForm();
                setIsOpen(false);
              }}
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !form.formData.designation.trim()}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Erstellen
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
