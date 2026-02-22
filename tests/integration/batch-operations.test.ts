import { describe, it, expect, vi } from "vitest";
import { processBatch } from "@/lib/batch/batch-operations";

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("processBatch utility", () => {
  it("should process all items successfully", async () => {
    const operation = vi.fn().mockResolvedValue("ok");
    const result = await processBatch(["a", "b", "c"], operation);

    expect(result.success).toEqual(["a", "b", "c"]);
    expect(result.failed).toHaveLength(0);
    expect(result.totalProcessed).toBe(3);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("should handle partial failures", async () => {
    const operation = vi.fn()
      .mockResolvedValueOnce("ok")
      .mockRejectedValueOnce(new Error("DB error"))
      .mockResolvedValueOnce("ok");

    const result = await processBatch(["a", "b", "c"], operation);

    expect(result.success).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toEqual({ id: "b", error: "DB error" });
    expect(result.totalProcessed).toBe(3);
  });

  it("should handle all failures", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("Failed"));
    const result = await processBatch(["a", "b"], operation);

    expect(result.success).toHaveLength(0);
    expect(result.failed).toHaveLength(2);
    expect(result.totalProcessed).toBe(2);
  });

  it("should process in chunks", async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `id-${i}`);
    const operation = vi.fn().mockResolvedValue("ok");
    const onProgress = vi.fn();

    await processBatch(ids, operation, { chunkSize: 10, onProgress });

    expect(operation).toHaveBeenCalledTimes(25);
    // 3 chunks: 10, 10, 5
    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress).toHaveBeenCalledWith(10, 25);
    expect(onProgress).toHaveBeenCalledWith(20, 25);
    expect(onProgress).toHaveBeenCalledWith(25, 25);
  });

  it("should handle empty input", async () => {
    const operation = vi.fn();
    const result = await processBatch([], operation);

    expect(result.success).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(result.totalProcessed).toBe(0);
    expect(operation).not.toHaveBeenCalled();
  });

  it("should handle non-Error thrown values", async () => {
    const operation = vi.fn().mockRejectedValue("string error");
    const result = await processBatch(["a"], operation);

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error).toBe("Unknown error");
  });
});
