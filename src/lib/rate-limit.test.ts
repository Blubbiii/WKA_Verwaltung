import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock next/server since NextResponse is not available in pure Node test environment
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) => ({
      body,
      status: init?.status ?? 200,
      headers: init?.headers ?? {},
    }),
  },
}));

import { rateLimit, getClientIp, AUTH_RATE_LIMIT, UPLOAD_RATE_LIMIT, API_RATE_LIMIT } from "./rate-limit";
import type { RateLimitConfig } from "./rate-limit";

// =============================================================================
// Test helpers
// =============================================================================

/**
 * Use a unique identifier per test to avoid cross-test interference
 * from the shared in-memory store.
 */
let testCounter = 0;
function uniqueId(prefix = "test"): string {
  return `${prefix}-${Date.now()}-${++testCounter}`;
}

// =============================================================================
// Preset Configurations
// =============================================================================

describe("Rate Limit Konfigurationen", () => {
  it("AUTH_RATE_LIMIT: 5 Anfragen pro 15 Minuten", () => {
    expect(AUTH_RATE_LIMIT.limit).toBe(5);
    expect(AUTH_RATE_LIMIT.windowMs).toBe(15 * 60 * 1000);
  });

  it("UPLOAD_RATE_LIMIT: 20 Anfragen pro Minute", () => {
    expect(UPLOAD_RATE_LIMIT.limit).toBe(20);
    expect(UPLOAD_RATE_LIMIT.windowMs).toBe(60 * 1000);
  });

  it("API_RATE_LIMIT: 100 Anfragen pro Minute", () => {
    expect(API_RATE_LIMIT.limit).toBe(100);
    expect(API_RATE_LIMIT.windowMs).toBe(60 * 1000);
  });
});

// =============================================================================
// rateLimit - Grundlegende Funktionalitaet
// =============================================================================

describe("rateLimit", () => {
  const config: RateLimitConfig = { limit: 3, windowMs: 60_000 };

  it("erlaubt Anfragen innerhalb des Limits", () => {
    const id = uniqueId();
    const result1 = rateLimit(id, config);
    expect(result1.success).toBe(true);
    expect(result1.remaining).toBe(2);

    const result2 = rateLimit(id, config);
    expect(result2.success).toBe(true);
    expect(result2.remaining).toBe(1);

    const result3 = rateLimit(id, config);
    expect(result3.success).toBe(true);
    expect(result3.remaining).toBe(0);
  });

  it("blockiert Anfragen die das Limit ueberschreiten", () => {
    const id = uniqueId();
    // Use up all allowed requests
    for (let i = 0; i < 3; i++) {
      rateLimit(id, config);
    }

    const blocked = rateLimit(id, config);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("gibt einen reset-Timestamp zurueck", () => {
    const id = uniqueId();
    const now = Date.now();
    const result = rateLimit(id, config);
    expect(result.reset).toBeGreaterThanOrEqual(now);
    expect(result.reset).toBeLessThanOrEqual(now + config.windowMs + 100);
  });

  it("verwendet separate Zaehler fuer unterschiedliche Identifier", () => {
    const id1 = uniqueId("user-a");
    const id2 = uniqueId("user-b");

    // Exhaust limit for id1
    for (let i = 0; i < 3; i++) {
      rateLimit(id1, config);
    }
    expect(rateLimit(id1, config).success).toBe(false);

    // id2 should still have full quota
    const result = rateLimit(id2, config);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(2);
  });
});

// =============================================================================
// rateLimit - Zeitfenster-Reset
// =============================================================================

describe("rateLimit - Zeitfenster", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("setzt das Limit nach Ablauf des Zeitfensters zurueck", () => {
    const config: RateLimitConfig = { limit: 2, windowMs: 10_000 };
    const id = uniqueId("window-reset");

    // Exhaust the limit
    rateLimit(id, config);
    rateLimit(id, config);
    expect(rateLimit(id, config).success).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(10_001);

    // Should be allowed again
    const result = rateLimit(id, config);
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("entfernt nur abgelaufene Timestamps aus dem Fenster", () => {
    const config: RateLimitConfig = { limit: 3, windowMs: 10_000 };
    const id = uniqueId("partial-reset");

    // Make 2 requests at time 0
    rateLimit(id, config);
    rateLimit(id, config);

    // Advance 6 seconds
    vi.advanceTimersByTime(6_000);

    // Make 1 more request at time 6000
    const result3 = rateLimit(id, config);
    expect(result3.success).toBe(true);
    expect(result3.remaining).toBe(0); // 3 total in window

    // Advance 5 more seconds (total: 11 seconds)
    // The first 2 requests (at time 0) should now be outside the 10s window
    vi.advanceTimersByTime(5_000);

    // Should have room for 2 more (only the request at t=6000 is still in window)
    const result4 = rateLimit(id, config);
    expect(result4.success).toBe(true);
    expect(result4.remaining).toBe(1);
  });
});

// =============================================================================
// rateLimit - remaining count
// =============================================================================

describe("rateLimit - remaining", () => {
  it("zaehlt remaining korrekt herunter", () => {
    const config: RateLimitConfig = { limit: 5, windowMs: 60_000 };
    const id = uniqueId("remaining");

    expect(rateLimit(id, config).remaining).toBe(4);
    expect(rateLimit(id, config).remaining).toBe(3);
    expect(rateLimit(id, config).remaining).toBe(2);
    expect(rateLimit(id, config).remaining).toBe(1);
    expect(rateLimit(id, config).remaining).toBe(0);
    // After limit exceeded
    expect(rateLimit(id, config).remaining).toBe(0);
  });
});

// =============================================================================
// getClientIp
// =============================================================================

describe("getClientIp", () => {
  it("extrahiert IP aus x-forwarded-for Header", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "192.168.1.1" },
    });
    expect(getClientIp(request)).toBe("192.168.1.1");
  });

  it("nimmt die erste IP aus x-forwarded-for (Komma-getrennt)", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "10.0.0.1, 172.16.0.1, 192.168.1.1" },
    });
    expect(getClientIp(request)).toBe("10.0.0.1");
  });

  it("trimmt Whitespace in x-forwarded-for", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "  10.0.0.1  , 172.16.0.1" },
    });
    expect(getClientIp(request)).toBe("10.0.0.1");
  });

  it("nutzt x-real-ip als Fallback", () => {
    const request = new Request("http://localhost", {
      headers: { "x-real-ip": "172.16.0.1" },
    });
    expect(getClientIp(request)).toBe("172.16.0.1");
  });

  it('gibt "unknown" zurueck wenn kein Header vorhanden', () => {
    const request = new Request("http://localhost");
    expect(getClientIp(request)).toBe("unknown");
  });

  it("bevorzugt x-forwarded-for ueber x-real-ip", () => {
    const request = new Request("http://localhost", {
      headers: {
        "x-forwarded-for": "10.0.0.1",
        "x-real-ip": "172.16.0.1",
      },
    });
    expect(getClientIp(request)).toBe("10.0.0.1");
  });
});
