// Types for the virtual folder structure in the Document Explorer

export interface FolderNode {
  parkId: string | null;
  parkName: string;
  documentCount: number;
  years: YearNode[];
}

export interface YearNode {
  year: number;
  documentCount: number;
  categories: CategoryNode[];
}

export interface CategoryNode {
  category: string;
  label: string;
  documentCount: number;
}

export interface ExplorerFile {
  id: string;
  type: "document" | "invoice";
  title: string;
  fileName: string;
  fileUrl: string;
  fileSizeBytes: number | null;
  mimeType: string | null;
  category: string;
  createdAt: string;
  park: { id: string; name: string } | null;
  // Invoice-specific fields
  invoiceNumber?: string;
  invoiceDate?: string;
  grossAmount?: number;
  status?: string;
}

export interface FolderPath {
  parkId: string | null;
  parkName: string;
  year: number;
  category: string;
  categoryLabel: string;
}

export const CATEGORY_LABELS: Record<string, string> = {
  CONTRACT: "Verträge",
  PROTOCOL: "Protokolle",
  REPORT: "Berichte",
  INVOICE: "Rechnungen (Dokumente)",
  PERMIT: "Genehmigungen",
  CORRESPONDENCE: "Korrespondenz",
  OTHER: "Sonstiges",
  INVOICE_PDF: "Rechnungen & Gutschriften",
};

export const CATEGORY_ICONS: Record<string, string> = {
  CONTRACT: "FileSignature",
  PROTOCOL: "FileText",
  REPORT: "BarChart3",
  INVOICE: "Receipt",
  PERMIT: "Shield",
  CORRESPONDENCE: "Mail",
  OTHER: "File",
  INVOICE_PDF: "Receipt",
};
