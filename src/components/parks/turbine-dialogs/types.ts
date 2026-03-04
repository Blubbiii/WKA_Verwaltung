// Shared types for Turbine Dialog components

export interface Turbine {
  id: string;
  designation: string;
  serialNumber: string | null;
  mastrNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  deviceType?: "WEA" | "PARKRECHNER" | "NVP";
  ratedPowerKw: number | null;
  hubHeightM: number | null;
  rotorDiameterM: number | null;
  commissioningDate: string | null;
  warrantyEndDate: string | null;
  latitude: number | null;
  longitude: number | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  technischeBetriebsfuehrung: string | null;
  kaufmaennischeBetriebsfuehrung: string | null;
  netzgesellschaftFundId: string | null;
  netzgesellschaftFund: { id: string; name: string; legalForm: string | null; fundCategory?: { id: string; name: string; code: string; color: string | null } | null } | null;
  operatorHistory?: { id: string; operatorFundId: string; operatorFund: { id: string; name: string; legalForm: string | null; fundCategory?: { id: string; name: string; code: string; color: string | null } | null } }[];
  // Per-turbine lease overrides
  minimumRent: number | null;
  weaSharePercentage: number | null;
  poolSharePercentage: number | null;
}

export interface ServiceEvent {
  id: string;
  eventType: string;
  title: string;
  description: string | null;
  scheduledDate: string | null;
  completedDate: string | null;
  status: string;
  _count?: {
    documents: number;
  };
}

export interface TurbineDocument {
  id: string;
  title: string;
  fileName: string;
  fileUrl: string;
  mimeType: string | null;
  category: string;
  createdAt: string;
}

export interface TechnicianSessionInfo {
  id: string;
  technicianName: string;
  companyName: string;
  checkInAt: string;
  checkOutAt: string | null;
  durationMinutes: number | null;
  workDescription: string | null;
  serviceEventId: string | null;
}

export interface TurbineDetail extends Turbine {
  qrToken?: string | null;
  serviceEvents: ServiceEvent[];
  technicianSessions?: TechnicianSessionInfo[];
  documents: TurbineDocument[];
  park?: { id: string; name: string; shortName: string | null };
  _count?: {
    serviceEvents: number;
    documents: number;
    contracts: number;
    technicianSessions: number;
  };
}

export interface TurbineDialogsProps {
  parkId: string;
  parkName: string;
  onSuccess: () => void;
  // Add Dialog
  isAddOpen: boolean;
  setIsAddOpen: (open: boolean) => void;
  // Edit Dialog
  isEditOpen: boolean;
  setIsEditOpen: (open: boolean) => void;
  editingTurbine: Turbine | null;
  // Detail Dialog
  isDetailOpen: boolean;
  setIsDetailOpen: (open: boolean) => void;
  viewingTurbine: Turbine | null;
}

// Shared constants
export const deviceTypeLabels: Record<string, string> = {
  WEA: "WEA",
  PARKRECHNER: "Parkrechner",
  NVP: "NVP",
};

export const statusColors = {
  ACTIVE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  INACTIVE: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  ARCHIVED: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
};

export const statusLabels = {
  ACTIVE: "Aktiv",
  INACTIVE: "Inaktiv",
  ARCHIVED: "Archiviert",
};

export const eventTypeLabels: Record<string, string> = {
  MAINTENANCE: "Wartung",
  REPAIR: "Reparatur",
  INSPECTION: "Inspektion",
  UPGRADE: "Upgrade",
  INCIDENT: "Störung",
  TECHNICIAN_VISIT: "Techniker-Besuch",
  OTHER: "Sonstige",
};

export const eventStatusLabels: Record<string, string> = {
  SCHEDULED: "Geplant",
  IN_PROGRESS: "In Arbeit",
  COMPLETED: "Abgeschlossen",
  CANCELLED: "Abgebrochen",
};

export const eventStatusColors: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-100 text-gray-800",
};

// Shared helpers
import { parse, isValid } from "date-fns";
import { format } from "date-fns";
import { de } from "date-fns/locale";

export function parseDateInput(value: string): Date | undefined {
  if (!value || value.length < 8) return undefined;
  const parsed = parse(value, "dd.MM.yyyy", new Date());
  return isValid(parsed) ? parsed : undefined;
}

export function formatDateInput(date: Date | undefined): string {
  return date ? format(date, "dd.MM.yyyy", { locale: de }) : "";
}

export function formatCapacity(kw: number): string {
  if (kw >= 1000) {
    return `${(kw / 1000).toFixed(1)} MW`;
  }
  return `${kw.toFixed(0)} kW`;
}
