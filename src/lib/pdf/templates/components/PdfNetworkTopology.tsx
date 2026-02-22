/**
 * PDF-native Network Topology component for the Annual Report.
 *
 * Renders the Gesellschafts-Struktur (NVP → Netzgesellschaft → Betreiber → WEA)
 * using @react-pdf/renderer View/Text layout components. This mirrors the
 * interactive NetworkTopology.tsx component from the park detail page but in a
 * static, print-friendly format.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer";

// ---------------------------------------------------------------------------
// Types (matching the data shape provided by the annual report generator)
// ---------------------------------------------------------------------------

interface TopologyFundCategory {
  color: string | null;
}

interface TopologyFund {
  id: string;
  name: string;
  legalForm: string | null;
  fundCategory?: TopologyFundCategory | null;
  childHierarchies?: Array<{
    ownershipPercentage: number | null;
    childFundId: string;
  }>;
}

export interface TopologyTurbine {
  id: string;
  designation: string;
  ratedPowerKw: number | null;
  status: string;
  netzgesellschaftFundId: string | null;
  netzgesellschaftFund: TopologyFund | null;
  operatorHistory?: Array<{
    ownershipPercentage: number | null;
    operatorFund: TopologyFund;
  }>;
}

export interface PdfNetworkTopologyProps {
  parkName: string;
  turbines: TopologyTurbine[];
  billingEntityName?: string | null;
}

// ---------------------------------------------------------------------------
// Grouping logic (same as NetworkTopology.tsx, adapted for server-side)
// ---------------------------------------------------------------------------

interface BetreiberInNetz {
  fund: TopologyFund;
  turbines: TopologyTurbine[];
  avgOwnershipPct: number | null;
}

interface NetzWithBetreiber {
  fundId: string | null;
  fund: TopologyFund | null;
  totalCapacityKw: number;
  betreiber: BetreiberInNetz[];
  unassignedTurbines: TopologyTurbine[];
}

function groupByNetzAndOperator(turbines: TopologyTurbine[]): NetzWithBetreiber[] {
  const netzMap = new Map<
    string | null,
    {
      fundId: string | null;
      fund: TopologyFund | null;
      turbines: TopologyTurbine[];
      totalCapacityKw: number;
    }
  >();

  for (const t of turbines) {
    const k = t.netzgesellschaftFundId;
    if (!netzMap.has(k)) {
      netzMap.set(k, {
        fundId: k,
        fund: t.netzgesellschaftFund,
        turbines: [],
        totalCapacityKw: 0,
      });
    }
    const g = netzMap.get(k)!;
    g.turbines.push(t);
    g.totalCapacityKw += t.ratedPowerKw ? Number(t.ratedPowerKw) : 0;
  }

  const netzGroups = Array.from(netzMap.values()).sort((a, b) => {
    if (!a.fundId && b.fundId) return 1;
    if (a.fundId && !b.fundId) return -1;
    return (a.fund?.name ?? "").localeCompare(b.fund?.name ?? "", "de");
  });

  return netzGroups.map((ng) => {
    const operatorMap = new Map<string, { fund: TopologyFund; turbines: TopologyTurbine[] }>();
    const unassigned: TopologyTurbine[] = [];

    for (const t of ng.turbines) {
      if (!t.operatorHistory || t.operatorHistory.length === 0) {
        unassigned.push(t);
        continue;
      }
      const op = t.operatorHistory[0];
      const k = op.operatorFund.id;
      if (!operatorMap.has(k)) {
        operatorMap.set(k, { fund: op.operatorFund, turbines: [] });
      }
      operatorMap.get(k)!.turbines.push(t);
    }

    // Ownership percentages from FundHierarchy (Netz → Betreiber)
    const hierarchyMap = new Map<string, number>();
    if (ng.fund?.childHierarchies) {
      for (const h of ng.fund.childHierarchies) {
        if (h.ownershipPercentage != null) {
          hierarchyMap.set(h.childFundId, Number(h.ownershipPercentage));
        }
      }
    }

    const betreiber = Array.from(operatorMap.values())
      .map(({ fund, turbines: ts }) => ({
        fund,
        turbines: ts,
        avgOwnershipPct: hierarchyMap.get(fund.id) ?? null,
      }))
      .sort((a, b) => a.fund.name.localeCompare(b.fund.name, "de"));

    return {
      fundId: ng.fundId,
      fund: ng.fund,
      totalCapacityKw: ng.totalCapacityKw,
      betreiber,
      unassignedTurbines: unassigned,
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_COLOR = "#94a3b8";

function fmtPower(kw: number) {
  return kw >= 1000 ? `${(kw / 1000).toFixed(1)} MW` : `${kw.toFixed(0)} kW`;
}

function fundLabel(fund: TopologyFund): string {
  return `${fund.name}${fund.legalForm ? ` ${fund.legalForm}` : ""}`;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const COLORS = {
  primary: "#1E3A5F",
  muted: "#666666",
  light: "#F5F5F5",
  border: "#E0E0E0",
  white: "#FFFFFF",
};

const s = StyleSheet.create({
  container: {
    marginTop: 5,
  },

  // NVP header
  nvpBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    padding: 8,
    borderRadius: 3,
    marginBottom: 10,
  },
  nvpDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#F59E0B",
    marginRight: 8,
  },
  nvpText: {
    fontSize: 10,
    fontWeight: "bold",
    color: COLORS.white,
  },
  nvpSub: {
    fontSize: 7,
    color: "#CBD5E1",
    marginLeft: 8,
  },

  // Netzgesellschaft group
  netzGroup: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    marginBottom: 8,
    marginLeft: 6,
  },
  netzHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  netzDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  netzName: {
    fontSize: 9,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  netzCapacity: {
    fontSize: 8,
    color: COLORS.muted,
    marginLeft: 8,
  },

  // Betreiber group
  betreiberGroup: {
    borderLeftWidth: 2,
    paddingLeft: 8,
    marginBottom: 6,
    marginLeft: 4,
  },
  betreiberHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  betreiberDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  betreiberName: {
    fontSize: 8,
    fontWeight: "bold",
    color: COLORS.primary,
  },
  betreiberPct: {
    fontSize: 7,
    color: COLORS.muted,
    marginLeft: 4,
  },

  // Turbine grid
  turbineGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  turbineBadge: {
    backgroundColor: COLORS.light,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 2,
    flexDirection: "row",
    alignItems: "center",
  },
  turbineStatusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 3,
  },
  turbineName: {
    fontSize: 7,
    color: COLORS.primary,
  },
  turbinePower: {
    fontSize: 6,
    color: COLORS.muted,
    marginLeft: 3,
  },

  // Legend
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.border,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  legendText: {
    fontSize: 7,
    color: COLORS.muted,
  },

  // Status legend
  statusLegend: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#22c55e",
  INACTIVE: "#eab308",
  ARCHIVED: "#9ca3af",
};

export function PdfNetworkTopology({
  parkName,
  turbines,
  billingEntityName,
}: PdfNetworkTopologyProps) {
  const netzGroups = groupByNetzAndOperator(turbines);

  if (netzGroups.length === 0) return null;

  // Collect unique operators for legend
  const operatorLegend: Array<{ name: string; color: string }> = [];
  const seenOps = new Set<string>();
  for (const ng of netzGroups) {
    for (const b of ng.betreiber) {
      if (!seenOps.has(b.fund.id)) {
        seenOps.add(b.fund.id);
        operatorLegend.push({
          name: fundLabel(b.fund),
          color: b.fund.fundCategory?.color || DEFAULT_COLOR,
        });
      }
    }
  }

  return (
    <View style={s.container}>
      {/* NVP header */}
      <View style={s.nvpBox}>
        <View style={s.nvpDot} />
        <Text style={s.nvpText}>Netzverknuepfungspunkt: {parkName}</Text>
        {billingEntityName && (
          <Text style={s.nvpSub}>Abrechnung: {billingEntityName}</Text>
        )}
      </View>

      {/* Netzgesellschaft groups */}
      {netzGroups.map((ng, ni) => {
        const netzColor = ng.fund?.fundCategory?.color || DEFAULT_COLOR;

        return (
          <View key={`netz-${ni}`} style={[s.netzGroup, { borderLeftColor: netzColor }]}>
            {/* Netz header */}
            <View style={s.netzHeader}>
              <View style={[s.netzDot, { backgroundColor: netzColor }]} />
              <Text style={s.netzName}>
                {ng.fund ? fundLabel(ng.fund) : "Ohne Netzgesellschaft"}
              </Text>
              <Text style={s.netzCapacity}>{fmtPower(ng.totalCapacityKw)}</Text>
            </View>

            {/* Betreiber sub-groups */}
            {ng.betreiber.map((b, bi) => {
              const opColor = b.fund.fundCategory?.color || DEFAULT_COLOR;

              return (
                <View
                  key={`betr-${ni}-${bi}`}
                  style={[s.betreiberGroup, { borderLeftColor: opColor }]}
                >
                  <View style={s.betreiberHeader}>
                    <View style={[s.betreiberDot, { backgroundColor: opColor }]} />
                    <Text style={s.betreiberName}>{fundLabel(b.fund)}</Text>
                    {b.avgOwnershipPct != null && (
                      <Text style={s.betreiberPct}>
                        ({b.avgOwnershipPct.toFixed(0)}%)
                      </Text>
                    )}
                  </View>

                  <View style={s.turbineGrid}>
                    {b.turbines.map((t) => (
                      <View key={t.id} style={s.turbineBadge}>
                        <View
                          style={[
                            s.turbineStatusDot,
                            { backgroundColor: STATUS_COLORS[t.status] || "#9ca3af" },
                          ]}
                        />
                        <Text style={s.turbineName}>{t.designation}</Text>
                        {t.ratedPowerKw != null && (
                          <Text style={s.turbinePower}>
                            {fmtPower(Number(t.ratedPowerKw))}
                          </Text>
                        )}
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}

            {/* Unassigned turbines (no operator) */}
            {ng.unassignedTurbines.length > 0 && (
              <View style={[s.betreiberGroup, { borderLeftColor: "#9ca3af" }]}>
                <View style={s.betreiberHeader}>
                  <View style={[s.betreiberDot, { backgroundColor: "#9ca3af" }]} />
                  <Text style={s.betreiberName}>Ohne Betreiberzuordnung</Text>
                </View>

                <View style={s.turbineGrid}>
                  {ng.unassignedTurbines.map((t) => (
                    <View key={t.id} style={s.turbineBadge}>
                      <View
                        style={[
                          s.turbineStatusDot,
                          { backgroundColor: STATUS_COLORS[t.status] || "#9ca3af" },
                        ]}
                      />
                      <Text style={s.turbineName}>{t.designation}</Text>
                      {t.ratedPowerKw != null && (
                        <Text style={s.turbinePower}>
                          {fmtPower(Number(t.ratedPowerKw))}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        );
      })}

      {/* Legend: operators */}
      {operatorLegend.length > 0 && (
        <View style={s.legend}>
          {operatorLegend.map((op, i) => (
            <View key={`leg-${i}`} style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: op.color }]} />
              <Text style={s.legendText}>{op.name}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Legend: status colors */}
      <View style={s.statusLegend}>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: "#22c55e" }]} />
          <Text style={s.legendText}>Aktiv</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: "#eab308" }]} />
          <Text style={s.legendText}>Inaktiv</Text>
        </View>
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: "#9ca3af" }]} />
          <Text style={s.legendText}>Archiviert</Text>
        </View>
      </View>
    </View>
  );
}
