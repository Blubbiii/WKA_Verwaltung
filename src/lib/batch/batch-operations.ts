import { logger } from "@/lib/logger";

export interface BatchResult {
  success: string[];
  failed: { id: string; error: string }[];
  totalProcessed: number;
}

interface BatchOptions {
  chunkSize?: number;
  onProgress?: (processed: number, total: number) => void;
}

/**
 * Process a batch of items with error handling per item.
 * Supports partial success - failed items don't block others.
 */
export async function processBatch<T>(
  ids: string[],
  operation: (id: string) => Promise<T>,
  options: BatchOptions = {}
): Promise<BatchResult> {
  const { chunkSize = 10, onProgress } = options;
  const result: BatchResult = {
    success: [],
    failed: [],
    totalProcessed: 0,
  };

  // Process in chunks to avoid overwhelming the DB
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);

    const promises = chunk.map(async (id) => {
      try {
        await operation(id);
        result.success.push(id);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        result.failed.push({ id, error: message });
        logger.warn({ id, error: message }, "Batch operation failed for item");
      }
    });

    await Promise.all(promises);
    result.totalProcessed += chunk.length;
    onProgress?.(result.totalProcessed, ids.length);
  }

  return result;
}
