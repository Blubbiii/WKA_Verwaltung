export interface MeiliDocument {
  id: string;
  title: string;
  description?: string;
  fileName: string;
  tags: string[];
  category: string;
  parkName?: string;
  fundName?: string;
  tenantId: string;
  createdAt: string;
}

export interface MeiliInvoice {
  id: string;
  invoiceNumber?: string;
  recipientName?: string;
  grossAmount?: number;
  status: string;
  invoiceType: string;
  tenantId: string;
  invoiceDate?: string;
}

export interface MeiliPark {
  id: string;
  name: string;
  shortName?: string;
  city?: string;
  description?: string;
  tenantId: string;
}

export interface MeiliTurbine {
  id: string;
  designation: string;
  model?: string;
  manufacturer?: string;
  parkName?: string;
  tenantId: string;
}

export interface MeiliAuditLog {
  id: string;
  action: string;
  entityType: string;
  userName?: string;
  tenantId: string;
  createdAt: string;
}

export type SearchEntity = "documents" | "invoices" | "parks" | "turbines" | "audit_logs";

export interface SearchResult<T> {
  id: string;
  entityType: SearchEntity;
  data: T;
  score?: number;
}
