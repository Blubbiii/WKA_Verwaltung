import { describe, it, expect, vi, beforeEach } from "vitest";

// ----------------------------------------------------------------
// Mocks — vi.hoisted() ensures these are available when vi.mock
// factories run (since vi.mock is hoisted to top of file)
// ----------------------------------------------------------------

const { mockFindMany, mockEnqueueWebhookDelivery, mockLogger } = vi.hoisted(
  () => ({
    mockFindMany: vi.fn(),
    mockEnqueueWebhookDelivery: vi.fn(),
    mockLogger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  })
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    webhook: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

vi.mock("@/lib/queue/queues/webhook.queue", () => ({
  enqueueWebhookDelivery: (...args: unknown[]) =>
    mockEnqueueWebhookDelivery(...args),
}));

vi.mock("@/lib/logger", () => ({
  apiLogger: mockLogger,
  logger: mockLogger,
}));

// ----------------------------------------------------------------
// Import after mocks are in place
// ----------------------------------------------------------------
import { dispatchWebhook } from "../dispatcher";
import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_CATEGORIES,
  type WebhookEventType,
} from "../events";

describe("Webhook Dispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([]);
    mockEnqueueWebhookDelivery.mockResolvedValue(undefined);
  });

  // ----------------------------------------------------------------
  // dispatchWebhook
  // ----------------------------------------------------------------
  describe("dispatchWebhook", () => {
    it("queries webhooks filtered by tenantId, isActive, and event", async () => {
      mockFindMany.mockResolvedValue([]);

      await dispatchWebhook("tenant-1", "invoice.created", {
        invoiceId: "inv-1",
      });

      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          tenantId: "tenant-1",
          isActive: true,
          events: { has: "invoice.created" },
        },
        select: { id: true, url: true, secret: true },
      });
    });

    it("enqueues delivery for each matching webhook", async () => {
      mockFindMany.mockResolvedValue([
        {
          id: "wh-1",
          url: "https://example.com/hook1",
          secret: "secret-1",
        },
        {
          id: "wh-2",
          url: "https://example.com/hook2",
          secret: "secret-2",
        },
      ]);

      await dispatchWebhook("tenant-1", "invoice.created", {
        invoiceId: "inv-1",
      });

      expect(mockEnqueueWebhookDelivery).toHaveBeenCalledTimes(2);
    });

    it("passes correct payload structure to enqueueWebhookDelivery", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-02-25T10:00:00Z"));

      mockFindMany.mockResolvedValue([
        {
          id: "wh-1",
          url: "https://example.com/hook",
          secret: "s3cret",
        },
      ]);

      await dispatchWebhook("tenant-42", "settlement.created", {
        settlementId: "stl-5",
      });

      expect(mockEnqueueWebhookDelivery).toHaveBeenCalledWith({
        webhookId: "wh-1",
        url: "https://example.com/hook",
        secret: "s3cret",
        payload: {
          event: "settlement.created",
          timestamp: "2026-02-25T10:00:00.000Z",
          tenantId: "tenant-42",
          data: { settlementId: "stl-5" },
        },
      });

      vi.useRealTimers();
    });

    it("does not enqueue anything when no webhooks match", async () => {
      mockFindMany.mockResolvedValue([]);

      await dispatchWebhook("tenant-1", "vote.closed", { voteId: "v-1" });

      expect(mockEnqueueWebhookDelivery).not.toHaveBeenCalled();
    });

    it("catches and logs errors instead of throwing (fire-and-forget)", async () => {
      const error = new Error("Database connection lost");
      mockFindMany.mockRejectedValue(error);

      // Should NOT throw
      await expect(
        dispatchWebhook("tenant-1", "invoice.paid", { invoiceId: "inv-1" })
      ).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: error }),
        expect.stringContaining("[Webhook]")
      );
    });

    it("catches enqueue errors without throwing", async () => {
      mockFindMany.mockResolvedValue([
        { id: "wh-1", url: "https://example.com/hook", secret: "s" },
      ]);
      mockEnqueueWebhookDelivery.mockRejectedValue(
        new Error("Redis unavailable")
      );

      await expect(
        dispatchWebhook("tenant-1", "invoice.sent", { invoiceId: "inv-2" })
      ).resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it("logs dispatch info after successful enqueue", async () => {
      mockFindMany.mockResolvedValue([
        { id: "wh-1", url: "https://example.com/hook", secret: "s" },
      ]);

      await dispatchWebhook("tenant-1", "document.uploaded", {
        documentId: "doc-1",
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "document.uploaded",
          tenantId: "tenant-1",
          webhookCount: 1,
        }),
        expect.stringContaining("[Webhook]")
      );
    });
  });

  // ----------------------------------------------------------------
  // Event Definitions (events.ts)
  // ----------------------------------------------------------------
  describe("Event Definitions", () => {
    it("all WEBHOOK_EVENTS have a non-empty label", () => {
      for (const [key, label] of Object.entries(WEBHOOK_EVENTS)) {
        expect(label, `Event "${key}" should have a label`).toBeTruthy();
        expect(typeof label).toBe("string");
        expect(label.length).toBeGreaterThan(0);
      }
    });

    it("has no duplicate event keys", () => {
      const keys = Object.keys(WEBHOOK_EVENTS);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });

    it("WEBHOOK_EVENT_CATEGORIES covers all events", () => {
      const allEventKeys = Object.keys(WEBHOOK_EVENTS) as WebhookEventType[];
      const categorizedEvents = new Set<string>();

      for (const category of Object.values(WEBHOOK_EVENT_CATEGORIES)) {
        for (const event of category.events) {
          categorizedEvents.add(event);
        }
      }

      for (const eventKey of allEventKeys) {
        expect(
          categorizedEvents.has(eventKey),
          `Event "${eventKey}" should be in at least one category`
        ).toBe(true);
      }
    });

    it("WEBHOOK_EVENT_CATEGORIES only references valid events", () => {
      const allEventKeys = new Set(Object.keys(WEBHOOK_EVENTS));

      for (const [catKey, category] of Object.entries(
        WEBHOOK_EVENT_CATEGORIES
      )) {
        for (const event of category.events) {
          expect(
            allEventKeys.has(event),
            `Category "${catKey}" references unknown event "${event}"`
          ).toBe(true);
        }
      }
    });

    it("each category has a non-empty label", () => {
      for (const [key, category] of Object.entries(
        WEBHOOK_EVENT_CATEGORIES
      )) {
        expect(
          category.label,
          `Category "${key}" should have a label`
        ).toBeTruthy();
        expect(category.label.length).toBeGreaterThan(0);
      }
    });

    it("each category has at least one event", () => {
      for (const [key, category] of Object.entries(
        WEBHOOK_EVENT_CATEGORIES
      )) {
        expect(
          category.events.length,
          `Category "${key}" should have at least one event`
        ).toBeGreaterThan(0);
      }
    });

    it("no event appears in multiple categories", () => {
      const seen = new Map<string, string>();

      for (const [catKey, category] of Object.entries(
        WEBHOOK_EVENT_CATEGORIES
      )) {
        for (const event of category.events) {
          expect(
            seen.has(event),
            `Event "${event}" appears in both "${seen.get(event)}" and "${catKey}"`
          ).toBe(false);
          seen.set(event, catKey);
        }
      }
    });
  });
});
