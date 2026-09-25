"use client";

/**
 * Generates the annual report in the background: POST /api/reports/annual/async
 * queues it, GET /api/reports/jobs/[id] is polled, and the finished PDF comes
 * from /api/reports/jobs/[id]/download. The page stays usable meanwhile, and
 * a large report no longer runs into the request timeout.
 */

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { downloadFromResponse } from "@/lib/download";
import { berichtsPhase, type BerichtsPhase } from "@/lib/reports/report-job";

interface JobStatus {
  state: string;
  progress: number | object;
  error: string | null;
}

export function useBackgroundReport(meldungen: { fertig: string; fehler: string }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [gestartet, setGestartet] = useState(0);
  const [startet, setStartet] = useState(false);
  const erledigt = useRef<string | null>(null);

  const { data } = useQuery({
    queryKey: ["report-job", jobId],
    enabled: !!jobId,
    refetchInterval: 2_000,
    queryFn: async (): Promise<JobStatus> => {
      const res = await fetch(`/api/reports/jobs/${jobId}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const phase: BerichtsPhase | null =
    jobId && data ? berichtsPhase(data.state, Date.now() - gestartet) : jobId ? "wartet" : null;

  useEffect(() => {
    if (!jobId || erledigt.current === jobId) return;
    if (phase === "fertig") {
      erledigt.current = jobId;
      (async () => {
        try {
          const res = await fetch(`/api/reports/jobs/${jobId}/download`);
          if (!res.ok) throw new Error(meldungen.fehler);
          await downloadFromResponse(res, "Jahresbericht.pdf");
          toast.success(meldungen.fertig);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : meldungen.fehler);
        } finally {
          setJobId(null);
        }
      })();
    } else if (phase === "fehler") {
      erledigt.current = jobId;
      toast.error(data?.error || meldungen.fehler, { duration: 12_000 });
      setJobId(null);
    }
  }, [phase, jobId, data?.error, meldungen.fertig, meldungen.fehler]);

  async function starten(body: Record<string, unknown>) {
    setStartet(true);
    try {
      const res = await fetch("/api/reports/annual/async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || meldungen.fehler);
      setGestartet(Date.now());
      setJobId(json.jobId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : meldungen.fehler);
    } finally {
      setStartet(false);
    }
  }

  const fortschritt = typeof data?.progress === "number" ? data.progress : null;

  return {
    phase,
    fortschritt,
    beschaeftigt: startet || (!!jobId && phase !== "haengt"),
    starten,
    /** Gives up waiting — used before falling back to direct generation. */
    abbrechen: () => {
      erledigt.current = jobId;
      setJobId(null);
    },
  };
}
