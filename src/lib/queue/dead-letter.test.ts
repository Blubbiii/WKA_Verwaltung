/**
 * Dead-Letter-Persistenz (F18).
 *
 * Der wichtigste Fall ist die Endgueltigkeit: BullMQ feuert `failed` bei jedem
 * fehlgeschlagenen Versuch. Ohne Pruefung entstuende pro Job eine Zeile je
 * Versuch und die Liste der offenen Fehlschlaege waere dreifach ueberzeichnet.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";

const createMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    failedJob: {
      create: (args: unknown) => createMock(args),
    },
  },
}));

import { persistFailedJob } from "./dead-letter";

/** Minimaler Job-Stub — nur die Felder, die persistFailedJob liest. */
function makeJob(overrides: {
  attemptsMade: number;
  attempts?: number;
  data?: Record<string, unknown>;
}): Job {
  return {
    id: "job-1",
    name: "process-billing",
    data: overrides.data ?? { tenantId: "tenant-a" },
    attemptsMade: overrides.attemptsMade,
    opts: { attempts: overrides.attempts ?? 3 },
  } as unknown as Job;
}

describe("persistFailedJob", () => {
  beforeEach(() => {
    createMock.mockReset();
    createMock.mockResolvedValue({ id: "row-1" });
  });

  it("schreibt NICHT, solange noch ein Retry folgt", async () => {
    await persistFailedJob({
      queueName: "billing",
      job: makeJob({ attemptsMade: 1, attempts: 3 }),
      error: new Error("boom"),
    });

    expect(createMock).not.toHaveBeenCalled();
  });

  it("schreibt genau einmal beim letzten Versuch", async () => {
    await persistFailedJob({
      queueName: "billing",
      job: makeJob({ attemptsMade: 3, attempts: 3 }),
      error: new Error("boom"),
    });

    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("ein Job mit 3 Attempts erzeugt über alle Versuche hinweg eine Zeile", async () => {
    for (const attemptsMade of [1, 2, 3]) {
      await persistFailedJob({
        queueName: "email",
        job: makeJob({ attemptsMade, attempts: 3 }),
        error: new Error("smtp down"),
      });
    }

    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("behandelt Jobs ohne attempts-Option als einmalig", async () => {
    const job = { ...makeJob({ attemptsMade: 1 }), opts: {} } as unknown as Job;

    await persistFailedJob({
      queueName: "webhook",
      job,
      error: new Error("boom"),
    });

    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("uebernimmt tenantId aus job.data", async () => {
    await persistFailedJob({
      queueName: "email",
      job: makeJob({ attemptsMade: 3, data: { tenantId: "tenant-b", to: "a@b.de" } }),
      error: new Error("boom"),
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: "tenant-b", queueName: "email" }),
      }),
    );
  });

  it("setzt tenantId auf null, wenn job.data keine hat", async () => {
    await persistFailedJob({
      queueName: "tus-gc",
      job: makeJob({ attemptsMade: 3, data: {} }),
      error: new Error("boom"),
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: null }),
      }),
    );
  });

  it("wirft nicht, wenn der DLQ-Schreibvorgang selbst scheitert", async () => {
    createMock.mockRejectedValue(new Error("db down"));

    await expect(
      persistFailedJob({
        queueName: "billing",
        job: makeJob({ attemptsMade: 3 }),
        error: new Error("boom"),
      }),
    ).resolves.toBeUndefined();
  });

  it("wirft nicht bei fehlendem Job", async () => {
    await expect(
      persistFailedJob({
        queueName: "billing",
        job: undefined,
        error: new Error("boom"),
      }),
    ).resolves.toBeUndefined();

    expect(createMock).not.toHaveBeenCalled();
  });
});
