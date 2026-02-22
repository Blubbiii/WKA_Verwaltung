// ===========================================
// Network Topology Types for WindparkManager
// ===========================================

// Node types for the network topology
export type NetworkNodeType =
  | "TURBINE"
  | "CABLE_JUNCTION"
  | "TRANSFORMER"
  | "NVP"
  | "SUBSTATION";

// Cable type options
export type CableType =
  | "20kV"
  | "0.4kV"
  | "Mittelspannung"
  | "Niederspannung"
  | "110kV";

// Node status derived from SCADA data
export type NodeStatus = "producing" | "reduced" | "offline" | "no_data";

// ===========================================
// API Types (as returned from the server)
// ===========================================

export interface NetworkNodeApi {
  id: string;
  tenantId: string;
  parkId: string;
  name: string;
  type: NetworkNodeType;
  posX: number;
  posY: number;
  turbineId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  turbine?: {
    id: string;
    designation: string;
    manufacturer: string | null;
    model: string | null;
    ratedPowerKw: number | null;
    status: string;
    deviceType: string;
  } | null;
}

export interface NetworkConnectionApi {
  id: string;
  tenantId: string;
  fromNodeId: string;
  toNodeId: string;
  cableType: string | null;
  lengthM: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface TopologyData {
  nodes: NetworkNodeApi[];
  connections: NetworkConnectionApi[];
  park: {
    id: string;
    name: string;
    shortName: string | null;
  };
}

// ===========================================
// Frontend State Types
// ===========================================

export interface TopologyNode {
  id: string;
  name: string;
  type: NetworkNodeType;
  posX: number;
  posY: number;
  turbineId: string | null;
  metadata: Record<string, unknown> | null;
  status: NodeStatus;
  turbine?: {
    id: string;
    designation: string;
    manufacturer: string | null;
    model: string | null;
    ratedPowerKw: number | null;
    status: string;
    deviceType: string;
  } | null;
}

export interface TopologyConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  cableType: string | null;
  lengthM: number | null;
  metadata: Record<string, unknown> | null;
}

// ===========================================
// Save/Update Payload
// ===========================================

export interface SaveTopologyPayload {
  parkId: string;
  nodes: Array<{
    id?: string;
    name: string;
    type: NetworkNodeType;
    posX: number;
    posY: number;
    turbineId?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
  connections: Array<{
    id?: string;
    fromNodeId: string;
    toNodeId: string;
    cableType?: string | null;
    lengthM?: number | null;
    metadata?: Record<string, unknown> | null;
  }>;
}

// ===========================================
// Configuration
// ===========================================

// Cable type color mapping for visualization
export const CABLE_TYPE_COLORS: Record<string, string> = {
  "20kV": "#ef4444",       // Red
  "110kV": "#dc2626",      // Darker red
  Mittelspannung: "#ef4444", // Red
  "0.4kV": "#3b82f6",     // Blue
  Niederspannung: "#3b82f6", // Blue
};

// Node type display config
export const NODE_TYPE_CONFIG: Record<
  NetworkNodeType,
  { label: string; color: string; icon: string }
> = {
  TURBINE: { label: "Windturbine", color: "#22c55e", icon: "turbine" },
  CABLE_JUNCTION: {
    label: "Kabelverteiler",
    color: "#a855f7",
    icon: "junction",
  },
  TRANSFORMER: { label: "Trafo", color: "#f59e0b", icon: "transformer" },
  NVP: {
    label: "Netzverknuepfungspunkt",
    color: "#ef4444",
    icon: "nvp",
  },
  SUBSTATION: { label: "Umspannwerk", color: "#ef4444", icon: "substation" },
};

// Node status color mapping
export const NODE_STATUS_COLORS: Record<NodeStatus, string> = {
  producing: "#22c55e",  // Green
  reduced: "#eab308",    // Yellow
  offline: "#ef4444",    // Red
  no_data: "#9ca3af",    // Gray
};

// Node status labels (German)
export const NODE_STATUS_LABELS: Record<NodeStatus, string> = {
  producing: "Produzierend",
  reduced: "Reduziert",
  offline: "Offline",
  no_data: "Keine Daten",
};
