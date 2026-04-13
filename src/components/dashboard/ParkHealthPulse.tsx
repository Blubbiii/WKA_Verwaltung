"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  PARK_HEALTH_LOOKBACK_DAYS,
  AVAILABILITY_WARNING_THRESHOLD,
} from "@/lib/config/business-thresholds";

interface ParkStatus {
  id: string;
  name: string;
  activeFaults: number;
  totalProductionKwh: number;
  avgAvailabilityPct: number | null;
}

export function ParkHealthPulse() {
  const t = useTranslations("dashboard.parkHealth");
  const [parks, setParks] = useState<ParkStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredPark, setHoveredPark] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [availabilityWarning, setAvailabilityWarning] = useState(
    AVAILABILITY_WARNING_THRESHOLD
  );
  const [lookbackDays, setLookbackDays] = useState(PARK_HEALTH_LOOKBACK_DAYS);

  // Load tenant thresholds, fall back to compile-time constants on failure
  useEffect(() => {
    fetch("/api/admin/settings/thresholds")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setAvailabilityWarning(
            typeof data.availabilityWarning === "number"
              ? data.availabilityWarning
              : AVAILABILITY_WARNING_THRESHOLD
          );
          setLookbackDays(
            typeof data.parkHealthLookbackDays === "number"
              ? data.parkHealthLookbackDays
              : PARK_HEALTH_LOOKBACK_DAYS
          );
        }
      })
      .catch(() => {
        // keep defaults
      });
  }, []);

  useEffect(() => {
    // Load parks first, then get status for each
    fetch("/api/parks?limit=50")
      .then((r) => r.json())
      .then(async (data) => {
        const parkList: Array<{ id: string; name: string }> = data.data || [];
        // Fetch daily overview for each park in parallel (limit to first 10)
        const statusResults = await Promise.all(
          parkList.slice(0, 10).map(async (park) => {
            try {
              const res = await fetch(
                `/api/energy/analytics/daily-overview?parkId=${park.id}&from=${new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString()}&to=${new Date().toISOString()}`
              );
              if (!res.ok) return null;
              const d = await res.json();
              return {
                id: park.id,
                name: park.name,
                activeFaults: d.kpis?.activeFaults ?? 0,
                totalProductionKwh: d.kpis?.totalProductionKwh ?? 0,
                avgAvailabilityPct: d.kpis?.avgAvailabilityPct ?? null,
              } as ParkStatus;
            } catch {
              return null;
            }
          })
        );
        setParks(statusResults.filter(Boolean) as ParkStatus[]);
        setLastUpdated(
          new Date().toLocaleTimeString("de-DE", {
            hour: "2-digit",
            minute: "2-digit",
          })
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [lookbackDays]);

  if (loading) {
    return (
      <div className="flex gap-1 h-2 mb-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex-1 h-full rounded-full bg-muted animate-pulse"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    );
  }

  if (parks.length === 0) return null;

  function getStatusColor(park: ParkStatus): {
    bar: string;
    glow: string;
    label: string;
  } {
    if (park.activeFaults > 0)
      return {
        bar: "#ef4444",
        glow: "rgba(239,68,68,0.3)",
        label: t("statusDisturbance"),
      };
    if (
      park.avgAvailabilityPct !== null &&
      park.avgAvailabilityPct < availabilityWarning
    )
      return {
        bar: "#f59e0b",
        glow: "rgba(245,158,11,0.3)",
        label: t("statusLimited"),
      };
    return {
      bar: "#22c55e",
      glow: "rgba(34,197,94,0.3)",
      label: t("statusNormal"),
    };
  }

  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">
          {t("parkStatus")}
        </span>
        <div className="flex-1 h-px bg-border/50" />
        <span className="text-xs text-muted-foreground">
          {t("okCount", { ok: parks.filter((p) => p.activeFaults === 0).length, total: parks.length })}
        </span>
      </div>
      <div className="flex gap-1">
        {parks.map((park) => {
          const { bar, glow, label } = getStatusColor(park);
          const isHovered = hoveredPark === park.id;
          return (
            <Link
              key={park.id}
              href={`/parks/${park.id}`}
              className="relative flex-1 rounded-full transition-all duration-200 cursor-pointer group"
              style={{
                height: isHovered ? "28px" : "6px",
                backgroundColor: bar,
                boxShadow: isHovered ? `0 0 12px ${glow}` : undefined,
                minWidth: "24px",
              }}
              onMouseEnter={() => setHoveredPark(park.id)}
              onMouseLeave={() => setHoveredPark(null)}
            >
              {isHovered && (
                <div
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-popover border border-border rounded-lg px-3 py-2 shadow-lg z-50 whitespace-nowrap pointer-events-none"
                  style={{ minWidth: "140px" }}
                >
                  <p className="font-semibold text-xs text-foreground">
                    {park.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: bar }}>
                    {label}
                  </p>
                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    <p>
                      {t("production", { value: (park.totalProductionKwh / 1000).toFixed(1) })}
                    </p>
                    {park.avgAvailabilityPct !== null && (
                      <p>
                        {t("availability", { pct: park.avgAvailabilityPct.toFixed(1) })}
                      </p>
                    )}
                    {park.activeFaults > 0 && (
                      <p className="text-red-500 font-medium">
                        {park.activeFaults === 1
                          ? t("activeFaultSingular", { count: park.activeFaults })
                          : t("activeFaultPlural", { count: park.activeFaults })}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </Link>
          );
        })}
      </div>
      {lastUpdated && (
        <p className="text-xs text-muted-foreground mt-2">
          {t("lastUpdated", { time: lastUpdated })}
        </p>
      )}
    </div>
  );
}
