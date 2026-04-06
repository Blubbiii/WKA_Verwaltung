/**
 * Solar performance calculations.
 *
 * Performance Ratio (PR) = actual yield / reference yield
 * Reference yield = irradiation (kWh/m²) × peak power (kWp) × area factor
 *
 * Simplified: PR = actualKwh / (irradiation × installedKwp)
 * Where irradiation is Global Horizontal Irradiance (GHI) in kWh/m²
 */

interface SolarPerformanceInput {
  actualProductionKwh: number;
  irradiationKwhM2: number;     // Global Horizontal Irradiance
  installedCapacityKwp: number;
}

interface SolarPerformanceResult {
  performanceRatio: number;     // 0-1 (e.g. 0.85 = 85%)
  specificYield: number;        // kWh/kWp
  referenceYield: number;       // Expected kWh at PR=1
  yieldLoss: number;            // kWh lost vs. reference
}

/**
 * Calculate Performance Ratio and related metrics for a solar park.
 */
export function calculateSolarPerformance({
  actualProductionKwh,
  irradiationKwhM2,
  installedCapacityKwp,
}: SolarPerformanceInput): SolarPerformanceResult {
  if (installedCapacityKwp <= 0 || irradiationKwhM2 <= 0) {
    return {
      performanceRatio: 0,
      specificYield: 0,
      referenceYield: 0,
      yieldLoss: 0,
    };
  }

  // Reference yield: what a perfect system would produce
  const referenceYield = irradiationKwhM2 * installedCapacityKwp;

  // Performance Ratio: actual vs. reference
  const performanceRatio = Math.min(actualProductionKwh / referenceYield, 1.0);

  // Specific yield: kWh per kWp installed
  const specificYield = actualProductionKwh / installedCapacityKwp;

  // Yield loss: difference between reference and actual
  const yieldLoss = Math.max(referenceYield - actualProductionKwh, 0);

  return {
    performanceRatio: Math.round(performanceRatio * 10000) / 10000,
    specificYield: Math.round(specificYield * 100) / 100,
    referenceYield: Math.round(referenceYield * 100) / 100,
    yieldLoss: Math.round(yieldLoss * 100) / 100,
  };
}

/**
 * Typical Performance Ratio benchmarks for solar parks.
 */
export const SOLAR_PR_BENCHMARKS = {
  excellent: 0.85,  // >85% — very well performing
  good: 0.80,       // 80-85% — normal operation
  fair: 0.75,       // 75-80% — below expectation
  poor: 0.70,       // <70% — investigation needed
} as const;

/**
 * Get a textual assessment of a solar park's performance.
 */
export function assessSolarPerformance(pr: number): {
  label: string;
  color: "green" | "yellow" | "orange" | "red";
} {
  if (pr >= SOLAR_PR_BENCHMARKS.excellent) return { label: "Ausgezeichnet", color: "green" };
  if (pr >= SOLAR_PR_BENCHMARKS.good) return { label: "Gut", color: "green" };
  if (pr >= SOLAR_PR_BENCHMARKS.fair) return { label: "Unterdurchschnittlich", color: "yellow" };
  if (pr >= SOLAR_PR_BENCHMARKS.poor) return { label: "Schwach", color: "orange" };
  return { label: "Kritisch", color: "red" };
}

export type { SolarPerformanceInput, SolarPerformanceResult };
