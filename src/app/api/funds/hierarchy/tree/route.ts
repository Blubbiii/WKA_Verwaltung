import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Fund-Daten aus der Datenbank
 */
interface FundData {
  id: string;
  name: string;
  legalForm: string | null;
  fundCategory: { id: string; name: string; code: string; color: string | null } | null;
  status: string;
  _count: {
    shareholders: number;
    operatedTurbines: number;
  };
}

/**
 * Hierarchie-Info aus der Map
 */
interface ParentInfo {
  parentFundId: string;
  hierarchyId: string;
  ownershipPercentage: number;
  validFrom: Date;
  validTo: Date | null;
}

/**
 * Knoten im Hierarchie-Baum für Visualisierung
 */
interface HierarchyTreeNode {
  id: string;
  fundId: string;
  name: string;
  legalForm: string | null;
  fundCategory: { id: string; name: string; code: string; color: string | null } | null;
  status: string;
  ownershipPercentage: number | null; // null für Root-Knoten
  validFrom: string | null;
  validTo: string | null;
  depth: number;
  children: HierarchyTreeNode[];
  // Zusätzliche Infos
  totalChildOwnership: number; // Summe der Anteile aller direkten Kinder
  shareholderCount: number;
  turbineCount: number;
}

/**
 * Flache Darstellung für Tabellen/Listen
 */
interface FlatHierarchyItem {
  hierarchyId: string;
  fundId: string;
  name: string;
  legalForm: string | null;
  fundCategory: { id: string; name: string; code: string; color: string | null } | null;
  parentFundId: string | null;
  parentFundName: string | null;
  ownershipPercentage: number;
  effectiveOwnership: number; // Berechneter effektiver Anteil (durchmultipliziert)
  depth: number;
  path: string[]; // Pfad von Root zu diesem Fund
}

// =============================================================================
// HELPER FUNCTIONS (ausserhalb des Request-Handlers)
// =============================================================================

/**
 * Rekursive Funktion zum Aufbau des Baums
 */
function buildTreeNode(
  fundId: string,
  depth: number,
  fundMap: Map<string, FundData>,
  childToParent: Map<string, ParentInfo>,
  parentToChildren: Map<string, string[]>
): HierarchyTreeNode | null {
  const fund = fundMap.get(fundId);
  if (!fund) return null;

  const parentInfo = childToParent.get(fundId);
  const childIds = parentToChildren.get(fundId) || [];

  // Rekursiv Kinder aufbauen
  const children: HierarchyTreeNode[] = [];
  let totalChildOwnership = 0;

  for (const childId of childIds) {
    const childInfo = childToParent.get(childId);
    if (childInfo) {
      const childNode = buildTreeNode(childId, depth + 1, fundMap, childToParent, parentToChildren);
      if (childNode) {
        children.push(childNode);
        totalChildOwnership += childInfo.ownershipPercentage;
      }
    }
  }

  // Sortiere Kinder nach Anteil (absteigend)
  children.sort((a, b) => (b.ownershipPercentage || 0) - (a.ownershipPercentage || 0));

  return {
    id: parentInfo?.hierarchyId || `root-${fundId}`,
    fundId: fund.id,
    name: fund.name,
    legalForm: fund.legalForm,
    fundCategory: fund.fundCategory,
    status: fund.status,
    ownershipPercentage: parentInfo ? parentInfo.ownershipPercentage : null,
    validFrom: parentInfo?.validFrom.toISOString() || null,
    validTo: parentInfo?.validTo?.toISOString() || null,
    depth,
    children,
    totalChildOwnership,
    shareholderCount: fund._count.shareholders,
    turbineCount: fund._count.operatedTurbines,
  };
}

/**
 * Funktion zum Flatten des Baums
 */
function flattenTree(
  node: HierarchyTreeNode,
  path: string[],
  parentName: string | null,
  effectiveOwnership: number
): FlatHierarchyItem[] {
  const items: FlatHierarchyItem[] = [];

  const currentPath = [...path, node.name];
  const currentEffective = node.ownershipPercentage !== null
    ? effectiveOwnership * (node.ownershipPercentage / 100)
    : effectiveOwnership;

  items.push({
    hierarchyId: node.id,
    fundId: node.fundId,
    name: node.name,
    legalForm: node.legalForm,
    fundCategory: node.fundCategory,
    parentFundId: path.length > 0 ? node.fundId : null,
    parentFundName: parentName,
    ownershipPercentage: node.ownershipPercentage ?? 100,
    effectiveOwnership: currentEffective,
    depth: node.depth,
    path: currentPath,
  });

  for (const child of node.children) {
    items.push(...flattenTree(child, currentPath, node.name, currentEffective));
  }

  return items;
}

/**
 * Max Tiefe im Baum berechnen
 */
function findMaxDepth(node: HierarchyTreeNode): number {
  if (node.children.length === 0) return node.depth;
  return Math.max(...node.children.map(findMaxDepth));
}

// =============================================================================
// GET /api/funds/hierarchy/tree - Hierarchie-Baum für Visualisierung
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    // Berechtigungsprüfung: MANAGER+ für Funds-Modul
    const check = await requirePermission(["funds:read"]);
    if (!check.authorized) return check.error;

    // URL-Parameter
    const { searchParams } = new URL(request.url);
    const rootFundId = searchParams.get("rootFundId"); // Optional: Starte bei diesem Fund
    const format = searchParams.get("format") || "tree"; // "tree" oder "flat"
    const activeOnly = searchParams.get("activeOnly") !== "false"; // Default: true

    // Lade alle Funds des Tenants
    const allFunds = await prisma.fund.findMany({
      where: {
        tenantId: check.tenantId!,
        status: "ACTIVE",
      },
      select: {
        id: true,
        name: true,
        legalForm: true,
        fundCategory: { select: { id: true, name: true, code: true, color: true } },
        status: true,
        _count: {
          select: {
            shareholders: true,
            operatedTurbines: {
              where: { status: "ACTIVE" },
            },
          },
        },
      },
    });

    // Lade alle aktiven Hierarchien
    const hierarchies = await prisma.fundHierarchy.findMany({
      where: {
        parentFund: {
          tenantId: check.tenantId!,
        },
        ...(activeOnly && { validTo: null }),
      },
      select: {
        id: true,
        parentFundId: true,
        childFundId: true,
        ownershipPercentage: true,
        validFrom: true,
        validTo: true,
      },
    });

    // Erstelle Lookup-Maps für schnellen Zugriff
    const fundMap = new Map<string, FundData>(allFunds.map((f) => [f.id, f]));

    // Map: childFundId -> parentInfo
    const childToParent = new Map<string, ParentInfo>();

    // Map: parentFundId -> childFundIds[]
    const parentToChildren = new Map<string, string[]>();

    for (const h of hierarchies) {
      childToParent.set(h.childFundId, {
        parentFundId: h.parentFundId,
        hierarchyId: h.id,
        ownershipPercentage: Number(h.ownershipPercentage),
        validFrom: h.validFrom,
        validTo: h.validTo,
      });

      if (!parentToChildren.has(h.parentFundId)) {
        parentToChildren.set(h.parentFundId, []);
      }
      parentToChildren.get(h.parentFundId)!.push(h.childFundId);
    }

    // Finde Root-Funds (Funds die kein Parent haben, aber Children haben könnten)
    const childFundIds = new Set(hierarchies.map((h) => h.childFundId));
    const rootFundIds = allFunds
      .filter((f) => !childFundIds.has(f.id))
      .map((f) => f.id);

    // Wenn ein spezifischer Root angegeben wurde, verwende nur diesen
    const startingFundIds = rootFundId ? [rootFundId] : rootFundIds;

    // Baue die Baeume auf
    const trees: HierarchyTreeNode[] = [];

    for (const fundId of startingFundIds) {
      const tree = buildTreeNode(fundId, 0, fundMap, childToParent, parentToChildren);
      if (tree) {
        trees.push(tree);
      }
    }

    // Sortiere Root-Knoten alphabetisch
    trees.sort((a, b) => a.name.localeCompare(b.name));

    // Statistiken berechnen
    const stats = {
      totalFunds: allFunds.length,
      rootFunds: rootFundIds.length,
      totalHierarchies: hierarchies.length,
      maxDepth: trees.length > 0 ? Math.max(0, ...trees.map(findMaxDepth)) : 0,
    };

    // Ausgabeformat
    if (format === "flat") {
      const flatItems: FlatHierarchyItem[] = [];
      for (const tree of trees) {
        flatItems.push(...flattenTree(tree, [], null, 100));
      }

      return NextResponse.json({
        data: flatItems,
        stats,
      });
    }

    // Default: Tree-Format
    return NextResponse.json({
      data: trees,
      stats,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching fund hierarchy tree");
    return NextResponse.json(
      { error: "Fehler beim Laden des Hierarchie-Baums" },
      { status: 500 }
    );
  }
}
