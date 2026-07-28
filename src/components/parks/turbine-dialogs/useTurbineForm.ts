"use client";

/**
 * useTurbineForm — Shared State-Verwaltung für Add + Edit Turbine Dialoge.
 *
 * Vor dem Refactor waren AddTurbineDialog (646 LOC) und EditTurbineDialog (467 LOC)
 * zu ~90% Copy-Paste. Dieser Hook konsolidiert:
 *  - formData-State (identisch zwischen Add + Edit)
 *  - Datum-States (commissioning + warranty, mit Text-Puffer für Manual-Input)
 *  - Fund-Loading + Fund-Categories-Loading
 *  - Inline-Fund-Creation-Flow (Zustand + POST-Handler)
 *  - Payload-Builder für POST/PUT (JSON.stringify Body)
 *
 * Edit-Modus:
 *  - Wird `turbine` übergeben, wird formData daraus initialisiert (via useEffect).
 *  - Add lässt turbine=null/undefined und arbeitet mit leerem Default.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { Turbine } from "./types";
import { formatDateInput } from "./types";

export type TurbineFormData = {
  designation: string;
  serialNumber: string;
  mastrNumber: string;
  manufacturer: string;
  model: string;
  ratedPowerKw: string;
  hubHeightM: string;
  rotorDiameterM: string;
  latitude: string;
  longitude: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  operatorFundId: string;
  technischeBetriebsfuehrung: string;
  kaufmaennischeBetriebsfuehrung: string;
  netzgesellschaftFundId: string;
  notes: string;
  minimumRent: string;
  weaSharePercentage: string;
  poolSharePercentage: string;
};

export type Fund = {
  id: string;
  name: string;
  legalForm: string | null;
  fundCategory?: {
    id: string;
    name: string;
    code: string;
    color: string | null;
  } | null;
};

export type FundCategory = {
  id: string;
  name: string;
  code: string;
  color: string | null;
};

const EMPTY_FORM: TurbineFormData = {
  designation: "",
  serialNumber: "",
  mastrNumber: "",
  manufacturer: "",
  model: "",
  ratedPowerKw: "",
  hubHeightM: "",
  rotorDiameterM: "",
  latitude: "",
  longitude: "",
  status: "ACTIVE",
  operatorFundId: "",
  technischeBetriebsfuehrung: "",
  kaufmaennischeBetriebsfuehrung: "",
  netzgesellschaftFundId: "",
  notes: "",
  minimumRent: "",
  weaSharePercentage: "",
  poolSharePercentage: "",
};

export function useTurbineForm(turbine?: Turbine | null) {
  const t = useTranslations("parks.turbineDialog");

  const [formData, setFormData] = useState<TurbineFormData>({ ...EMPTY_FORM });
  const [commissioningDate, setCommissioningDate] = useState<Date | undefined>();
  const [warrantyEndDate, setWarrantyEndDate] = useState<Date | undefined>();
  const [commissioningDateText, setCommissioningDateText] = useState("");
  const [warrantyEndDateText, setWarrantyEndDateText] = useState("");

  const [funds, setFunds] = useState<Fund[]>([]);
  const [fundCategories, setFundCategories] = useState<FundCategory[]>([]);

  const [fundCreationTarget, setFundCreationTarget] = useState<
    "operator" | "netzgesellschaft"
  >("netzgesellschaft");
  const [showNewFundDialog, setShowNewFundDialog] = useState(false);
  const [newFundName, setNewFundName] = useState("");
  const [newFundLegalForm, setNewFundLegalForm] = useState("");
  const [newFundCategoryId, setNewFundCategoryId] = useState("");
  const [isCreatingFund, setIsCreatingFund] = useState(false);

  const loadFunds = useCallback(async () => {
    try {
      const response = await fetch("/api/funds?limit=200");
      if (response.ok) {
        const data = await response.json();
        const fundList = data.data ?? data;
        setFunds(
          Array.isArray(fundList)
            ? fundList.map((f: Fund) => ({
                id: f.id,
                name: f.name,
                legalForm: f.legalForm,
                fundCategory: f.fundCategory,
              }))
            : [],
        );
      }
    } catch {
      // Fund loading failed silently
    }
  }, []);

  const loadFundCategories = useCallback(async () => {
    try {
      const response = await fetch("/api/fund-categories");
      if (response.ok) {
        const data = await response.json();
        setFundCategories(data.data ?? []);
      }
    } catch {
      // Fund categories loading failed silently
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadFunds();
    loadFundCategories();
  }, [loadFunds, loadFundCategories]);

  // Reload fund categories when the inline fund creation dialog opens
  useEffect(() => {
    if (showNewFundDialog) {
      loadFundCategories();
    }
  }, [showNewFundDialog, loadFundCategories]);

  // Sync formData from turbine (Edit-Mode only)
  useEffect(() => {
    if (turbine) {
      const activeOperator = turbine.operatorHistory?.find(() => true);
      setFormData({
        designation: turbine.designation,
        serialNumber: turbine.serialNumber || "",
        mastrNumber: turbine.mastrNumber || "",
        manufacturer: turbine.manufacturer || "",
        model: turbine.model || "",
        ratedPowerKw: turbine.ratedPowerKw?.toString() || "",
        hubHeightM: turbine.hubHeightM?.toString() || "",
        rotorDiameterM: turbine.rotorDiameterM?.toString() || "",
        latitude: turbine.latitude?.toString() || "",
        longitude: turbine.longitude?.toString() || "",
        status: turbine.status,
        operatorFundId: activeOperator?.operatorFundId || "",
        technischeBetriebsfuehrung: turbine.technischeBetriebsfuehrung || "",
        kaufmaennischeBetriebsfuehrung:
          turbine.kaufmaennischeBetriebsfuehrung || "",
        netzgesellschaftFundId: turbine.netzgesellschaftFundId || "",
        notes: turbine.notes || "",
        minimumRent: turbine.minimumRent?.toString() || "",
        weaSharePercentage: turbine.weaSharePercentage?.toString() || "",
        poolSharePercentage: turbine.poolSharePercentage?.toString() || "",
      });
      const cDate = turbine.commissioningDate
        ? new Date(turbine.commissioningDate)
        : undefined;
      const wDate = turbine.warrantyEndDate
        ? new Date(turbine.warrantyEndDate)
        : undefined;
      setCommissioningDate(cDate);
      setWarrantyEndDate(wDate);
      setCommissioningDateText(formatDateInput(cDate));
      setWarrantyEndDateText(formatDateInput(wDate));
    }
  }, [turbine]);

  const resetForm = useCallback(() => {
    setFormData({ ...EMPTY_FORM });
    setCommissioningDate(undefined);
    setWarrantyEndDate(undefined);
    setCommissioningDateText("");
    setWarrantyEndDateText("");
  }, []);

  const handleCreateFund = useCallback(async () => {
    if (!newFundName.trim()) {
      toast.error(t("validation.nameRequired"));
      return;
    }
    try {
      setIsCreatingFund(true);
      const response = await fetch("/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFundName,
          legalForm: newFundLegalForm || undefined,
          fundCategoryId: newFundCategoryId || undefined,
        }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t("toast.fundCreateError"));
      }
      const created = await response.json();
      setFunds((prev) => [
        ...prev,
        {
          id: created.id,
          name: created.name,
          legalForm: created.legalForm,
          fundCategory: created.fundCategory,
        },
      ]);
      // Functional update — vermeidet stale-closure auf formData
      setFormData((prev) =>
        fundCreationTarget === "operator"
          ? { ...prev, operatorFundId: created.id }
          : { ...prev, netzgesellschaftFundId: created.id },
      );
      setShowNewFundDialog(false);
      setNewFundName("");
      setNewFundLegalForm("");
      setNewFundCategoryId("");
      toast.success(t("toast.fundCreated"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("toast.fundCreateError"),
      );
    } finally {
      setIsCreatingFund(false);
    }
  }, [
    newFundName,
    newFundLegalForm,
    newFundCategoryId,
    fundCreationTarget,
    t,
  ]);

  /**
   * Baut das JSON-Body für POST /api/turbines (Add) oder PUT /api/turbines/[id]
   * (Edit). Add-Caller merged sein eigenes `parkId` in das Ergebnis.
   */
  const buildSubmitPayload = useCallback(() => {
    return {
      designation: formData.designation,
      serialNumber: formData.serialNumber || null,
      mastrNumber: formData.mastrNumber || null,
      manufacturer: formData.manufacturer || null,
      model: formData.model || null,
      ratedPowerKw: formData.ratedPowerKw
        ? parseFloat(formData.ratedPowerKw)
        : null,
      hubHeightM: formData.hubHeightM ? parseFloat(formData.hubHeightM) : null,
      rotorDiameterM: formData.rotorDiameterM
        ? parseFloat(formData.rotorDiameterM)
        : null,
      latitude: formData.latitude ? parseFloat(formData.latitude) : null,
      longitude: formData.longitude ? parseFloat(formData.longitude) : null,
      commissioningDate: commissioningDate?.toISOString() || null,
      warrantyEndDate: warrantyEndDate?.toISOString() || null,
      status: formData.status,
      operatorFundId: formData.operatorFundId || null,
      technischeBetriebsfuehrung: formData.technischeBetriebsfuehrung || null,
      kaufmaennischeBetriebsfuehrung:
        formData.kaufmaennischeBetriebsfuehrung || null,
      netzgesellschaftFundId: formData.netzgesellschaftFundId || null,
      notes: formData.notes || null,
      minimumRent: formData.minimumRent
        ? parseFloat(formData.minimumRent)
        : null,
      weaSharePercentage: formData.weaSharePercentage
        ? parseFloat(formData.weaSharePercentage)
        : null,
      poolSharePercentage: formData.poolSharePercentage
        ? parseFloat(formData.poolSharePercentage)
        : null,
    };
  }, [formData, commissioningDate, warrantyEndDate]);

  return {
    // Form State
    formData,
    setFormData,
    commissioningDate,
    setCommissioningDate,
    warrantyEndDate,
    setWarrantyEndDate,
    commissioningDateText,
    setCommissioningDateText,
    warrantyEndDateText,
    setWarrantyEndDateText,
    // Fund State
    funds,
    fundCategories,
    // Inline Fund Creation
    fundCreationTarget,
    setFundCreationTarget,
    showNewFundDialog,
    setShowNewFundDialog,
    newFundName,
    setNewFundName,
    newFundLegalForm,
    setNewFundLegalForm,
    newFundCategoryId,
    setNewFundCategoryId,
    isCreatingFund,
    handleCreateFund,
    // Actions
    resetForm,
    buildSubmitPayload,
  };
}
