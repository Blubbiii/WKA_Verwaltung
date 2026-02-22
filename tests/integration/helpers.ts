import { NextResponse } from "next/server";

// Factory functions for test data

export function createMockInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-001",
    invoiceType: "INVOICE",
    invoiceNumber: "RE-2026-0001",
    invoiceDate: new Date("2026-01-15"),
    dueDate: new Date("2026-02-15"),
    recipientName: "Test GmbH",
    recipientAddress: "Teststraße 1, 12345 Berlin",
    netAmount: 1000.0,
    taxRate: 19.0,
    taxAmount: 190.0,
    grossAmount: 1190.0,
    currency: "EUR",
    status: "DRAFT",
    tenantId: "test-tenant-id",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockPark(overrides: Record<string, unknown> = {}) {
  return {
    id: "park-001",
    name: "Windpark Testfeld",
    location: "Schleswig-Holstein",
    latitude: 54.32,
    longitude: 9.87,
    capacity: 15000,
    turbineCount: 5,
    status: "ACTIVE",
    tenantId: "test-tenant-id",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockFund(overrides: Record<string, unknown> = {}) {
  return {
    id: "fund-001",
    name: "Testfonds I GmbH & Co. KG",
    shortName: "TF-I",
    type: "KOMMANDITGESELLSCHAFT",
    status: "ACTIVE",
    tenantId: "test-tenant-id",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-001",
    email: "test@example.com",
    firstName: "Max",
    lastName: "Mustermann",
    role: "MANAGER",
    status: "ACTIVE",
    tenantId: "test-tenant-id",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc-001",
    title: "Testdokument",
    category: "CONTRACT",
    fileName: "test.pdf",
    fileUrl: "/uploads/test.pdf",
    version: 1,
    tags: [],
    isArchived: false,
    approvalStatus: "DRAFT",
    tenantId: "test-tenant-id",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockSettlement(overrides: Record<string, unknown> = {}) {
  return {
    id: "settle-001",
    year: 2026,
    month: 1,
    netOperatorRevenueEur: 50000.0,
    totalProductionKwh: 250000.0,
    distributionMode: "SMOOTHED",
    status: "DRAFT",
    parkId: "park-001",
    park: { tenantId: "test-tenant-id" },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Assert that an API response is an error with the expected status
 */
export async function expectApiError(
  response: NextResponse,
  status: number,
  message?: string
) {
  const body = await response.json();
  if (response.status !== status) {
    throw new Error(
      `Expected status ${status}, got ${response.status}: ${JSON.stringify(body)}`
    );
  }
  if (message && body.error !== message) {
    throw new Error(`Expected error "${message}", got "${body.error}"`);
  }
  return body;
}

/**
 * Assert that an API response is successful (2xx)
 */
export async function expectApiSuccess(response: NextResponse) {
  if (response.status < 200 || response.status >= 300) {
    const body = await response.json();
    throw new Error(
      `Expected success, got ${response.status}: ${JSON.stringify(body)}`
    );
  }
  return response.json();
}
