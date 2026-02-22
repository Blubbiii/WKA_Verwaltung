/**
 * Settlement Module - Pacht- und Stromabrechnung
 */

// ===========================================
// LEASE SETTLEMENT (Pachtabrechnung)
// ===========================================

export {
  // Haupt-Berechnungsfunktionen
  calculateSettlement,
  calculateMonthlyAdvance,
  saveSettlementCalculation,
  // Basis-Types
  type SettlementCalculationResult,
  type LeaseCalculationResult,
  type PlotAreaCalculationResult,
  type CalculateSettlementOptions,
  // Advance (Vorschuss) Types
  type AdvanceCalculationResult,
  type MonthlyAdvanceResult,
  type CalculateMonthlyAdvanceOptions,
  type AdvancePaymentInfo,
  // Final Settlement Types
  type FinalSettlementResult,
  type FinalLeaseCalculationResult,
} from "./calculator";

// ===========================================
// ENERGY SETTLEMENT (Stromabrechnung mit DULDUNG)
// ===========================================

export {
  // Hauptfunktionen
  calculateEnergySettlement,
  saveEnergySettlement,
  loadEnergySettlement,
  // Verteilungs-Berechnungen
  calculateProportionalDistribution,
  calculateSmoothedDistribution,
  calculateToleratedDistribution,
  // Hilfsfunktionen
  calculateSingleTurbineAdjustment,
  aggregateByOperator,
  calculateOperatorSummary,
  // Types
  type EnergySettlementInput,
  type EnergySettlementResult,
  type TurbineDistribution,
} from "./energy-calculator";
