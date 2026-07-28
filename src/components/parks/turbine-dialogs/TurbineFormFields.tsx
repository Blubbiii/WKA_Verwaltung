"use client";

/**
 * TurbineFormFields — Pure Presentation der Turbine-Form (Add + Edit teilen sich diese).
 *
 * Vor dem Refactor waren AddTurbineDialog (646 LOC) und EditTurbineDialog (467 LOC)
 * zu ~90% Copy-Paste. Diese Komponente rendert alle Form-Sections (Basis, Betrieb,
 * Netz, Pacht-Override, Technik, Standort, Notizen) einmal.
 *
 * State-Management ist NICHT hier — der Caller nutzt `useTurbineForm` und reicht
 * die Setter durch. Diese Komponente ist rein präsentational.
 *
 * `idPrefix` sorgt für eindeutige HTML-IDs (Add nutzt "", Edit nutzt "edit-").
 */

import { de } from "date-fns/locale";
import { CalendarIcon, Plus, Info } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { parseDateInput, formatDateInput } from "./types";
import type { TurbineFormData, Fund } from "./useTurbineForm";

interface TurbineFormFieldsProps {
  idPrefix?: string;
  formData: TurbineFormData;
  setFormData: Dispatch<SetStateAction<TurbineFormData>>;
  commissioningDate: Date | undefined;
  setCommissioningDate: Dispatch<SetStateAction<Date | undefined>>;
  warrantyEndDate: Date | undefined;
  setWarrantyEndDate: Dispatch<SetStateAction<Date | undefined>>;
  commissioningDateText: string;
  setCommissioningDateText: Dispatch<SetStateAction<string>>;
  warrantyEndDateText: string;
  setWarrantyEndDateText: Dispatch<SetStateAction<string>>;
  funds: Fund[];
  onCreateNewFund: (target: "operator" | "netzgesellschaft") => void;
}

export function TurbineFormFields({
  idPrefix,
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
  funds,
  onCreateNewFund,
}: TurbineFormFieldsProps) {
  const p = idPrefix ? `${idPrefix}-` : "";

  const renderFundSelect = (
    value: string,
    onChange: (v: string) => void,
    target: "operator" | "netzgesellschaft",
  ) => (
    <Select
      value={value || "__none__"}
      onValueChange={(v) => {
        if (v === "__create_new__") {
          onCreateNewFund(target);
          return;
        }
        onChange(v === "__none__" ? "" : v);
      }}
    >
      <SelectTrigger>
        <SelectValue placeholder="Gesellschaft wählen" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">-- Nicht zugeordnet --</SelectItem>
        {funds.map((fund) => (
          <SelectItem key={fund.id} value={fund.id}>
            <span className="flex items-center gap-2">
              {fund.name}
              {fund.legalForm ? ` (${fund.legalForm})` : ""}
              {fund.fundCategory && (
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0"
                  style={{ backgroundColor: fund.fundCategory.color || undefined }}
                >
                  {fund.fundCategory.name}
                </Badge>
              )}
            </span>
          </SelectItem>
        ))}
        <SelectItem value="__create_new__">
          <span className="flex items-center gap-2 text-primary">
            <Plus className="h-3 w-3" />
            Neue Gesellschaft anlegen
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-6 py-4">
      {/* Basis-Informationen */}
      <div className="space-y-4">
        <h4 className="font-medium">Basis-Informationen</h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`${p}designation`}>Bezeichnung *</Label>
            <Input
              id={`${p}designation`}
              placeholder="WEA 01"
              value={formData.designation}
              onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${p}serialNumber`}>Seriennummer</Label>
            <Input
              id={`${p}serialNumber`}
              placeholder="SN-12345"
              value={formData.serialNumber}
              onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${p}mastrNumber`}>MaStR-Nummer</Label>
            <Input
              id={`${p}mastrNumber`}
              placeholder="SEE123456789012"
              value={formData.mastrNumber}
              onChange={(e) => setFormData({ ...formData, mastrNumber: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${p}status`}>Status</Label>
          <Select
            value={formData.status}
            onValueChange={(value: "ACTIVE" | "INACTIVE" | "ARCHIVED") =>
              setFormData({ ...formData, status: value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Aktiv</SelectItem>
              <SelectItem value="INACTIVE">Inaktiv</SelectItem>
              <SelectItem value="ARCHIVED">Archiviert</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      {/* Betrieb & Verwaltung */}
      <div className="space-y-4">
        <h4 className="font-medium">Betrieb & Verwaltung</h4>
        <div className="space-y-2">
          <Label>Betreibergesellschaft</Label>
          {renderFundSelect(
            formData.operatorFundId,
            (v) => setFormData({ ...formData, operatorFundId: v }),
            "operator",
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`${p}technischeBetriebsfuehrung`}>
              Technische Betriebsführung
            </Label>
            <Input
              id={`${p}technischeBetriebsfuehrung`}
              placeholder="z.B. Enercon GmbH"
              value={formData.technischeBetriebsfuehrung}
              onChange={(e) =>
                setFormData({ ...formData, technischeBetriebsfuehrung: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${p}kaufmaennischeBetriebsfuehrung`}>
              Kaufmaennische Betriebsführung
            </Label>
            <Input
              id={`${p}kaufmaennischeBetriebsfuehrung`}
              placeholder="z.B. Windpark Service GmbH"
              value={formData.kaufmaennischeBetriebsfuehrung}
              onChange={(e) =>
                setFormData({ ...formData, kaufmaennischeBetriebsfuehrung: e.target.value })
              }
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Netzanbindung */}
      <div className="space-y-4">
        <h4 className="font-medium">Netzanbindung</h4>
        <div className="space-y-2">
          <Label>Netzgesellschaft</Label>
          {renderFundSelect(
            formData.netzgesellschaftFundId,
            (v) => setFormData({ ...formData, netzgesellschaftFundId: v }),
            "netzgesellschaft",
          )}
        </div>
      </div>

      <Separator />

      {/* Pacht-Konfiguration (Override) */}
      <div className="space-y-4">
        <h4 className="font-medium">Pacht-Konfiguration (optional)</h4>
        <TooltipProvider delayDuration={200}>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor={`${p}minimumRent`}>Mindestpacht (EUR)</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px]">
                    <p>Optional. Überschreibt die Mindestpacht des Windparks für diese Anlage. Leer = Park-Standard.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id={`${p}minimumRent`}
                type="number"
                step="0.01"
                min="0"
                placeholder="Park-Standard"
                value={formData.minimumRent}
                onChange={(e) => setFormData({ ...formData, minimumRent: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor={`${p}weaSharePercentage`}>WEA-Anteil (%)</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px]">
                    <p>Optional. Überschreibt den WEA-Anteil des Windparks für diese Anlage. Leer = Park-Standard.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id={`${p}weaSharePercentage`}
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="Park-Standard"
                value={formData.weaSharePercentage}
                onChange={(e) => setFormData({ ...formData, weaSharePercentage: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor={`${p}poolSharePercentage`}>Pool-Anteil (%)</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px]">
                    <p>Optional. Überschreibt den Pool-Anteil des Windparks für diese Anlage. Leer = Park-Standard.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id={`${p}poolSharePercentage`}
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="Park-Standard"
                value={formData.poolSharePercentage}
                onChange={(e) => setFormData({ ...formData, poolSharePercentage: e.target.value })}
              />
            </div>
          </div>
        </TooltipProvider>
      </div>

      <Separator />

      {/* Technische Daten */}
      <div className="space-y-4">
        <h4 className="font-medium">Technische Daten</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`${p}manufacturer`}>Hersteller</Label>
            <Input
              id={`${p}manufacturer`}
              placeholder="Vestas"
              value={formData.manufacturer}
              onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${p}model`}>Modell</Label>
            <Input
              id={`${p}model`}
              placeholder="V150-4.2"
              value={formData.model}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`${p}ratedPowerKw`}>Leistung (kW)</Label>
            <Input
              id={`${p}ratedPowerKw`}
              type="number"
              step="0.01"
              placeholder="4200"
              value={formData.ratedPowerKw}
              onChange={(e) => setFormData({ ...formData, ratedPowerKw: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${p}hubHeightM`}>Nabenhoehe (m)</Label>
            <Input
              id={`${p}hubHeightM`}
              type="number"
              step="0.1"
              placeholder="166"
              value={formData.hubHeightM}
              onChange={(e) => setFormData({ ...formData, hubHeightM: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${p}rotorDiameterM`}>Rotor (m)</Label>
            <Input
              id={`${p}rotorDiameterM`}
              type="number"
              step="0.1"
              placeholder="150"
              value={formData.rotorDiameterM}
              onChange={(e) => setFormData({ ...formData, rotorDiameterM: e.target.value })}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Inbetriebnahme</Label>
            <div className="flex gap-2">
              <Input
                placeholder="TT.MM.JJJJ"
                value={commissioningDateText}
                onChange={(e) => {
                  setCommissioningDateText(e.target.value);
                  const parsed = parseDateInput(e.target.value);
                  if (parsed) setCommissioningDate(parsed);
                }}
                onBlur={() => {
                  if (commissioningDate) setCommissioningDateText(formatDateInput(commissioningDate));
                }}
                className="flex-1"
              />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="shrink-0" aria-label="Datum auswählen">
                    <CalendarIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={commissioningDate}
                    onSelect={(date) => {
                      setCommissioningDate(date);
                      setCommissioningDateText(formatDateInput(date));
                    }}
                    locale={de}
                    captionLayout="dropdown"
                    startMonth={new Date(2000, 0)}
                    endMonth={new Date()}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Garantie bis</Label>
            <div className="flex gap-2">
              <Input
                placeholder="TT.MM.JJJJ"
                value={warrantyEndDateText}
                onChange={(e) => {
                  setWarrantyEndDateText(e.target.value);
                  const parsed = parseDateInput(e.target.value);
                  if (parsed) setWarrantyEndDate(parsed);
                }}
                onBlur={() => {
                  if (warrantyEndDate) setWarrantyEndDateText(formatDateInput(warrantyEndDate));
                }}
                className="flex-1"
              />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="shrink-0" aria-label="Datum auswählen">
                    <CalendarIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={warrantyEndDate}
                    onSelect={(date) => {
                      setWarrantyEndDate(date);
                      setWarrantyEndDateText(formatDateInput(date));
                    }}
                    locale={de}
                    captionLayout="dropdown"
                    startMonth={new Date()}
                    endMonth={new Date(2050, 11)}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      {/* Standort */}
      <div className="space-y-4">
        <h4 className="font-medium">Standort</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`${p}latitude`}>Breitengrad</Label>
            <Input
              id={`${p}latitude`}
              type="number"
              step="any"
              placeholder="54.1234"
              value={formData.latitude}
              onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${p}longitude`}>Laengengrad</Label>
            <Input
              id={`${p}longitude`}
              type="number"
              step="any"
              placeholder="8.5678"
              value={formData.longitude}
              onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Notizen */}
      <div className="space-y-4">
        <h4 className="font-medium">Notizen</h4>
        <Textarea
          placeholder="Freitext für interne Notizen, Besonderheiten..."
          className="min-h-[100px]"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        />
      </div>
    </div>
  );
}
