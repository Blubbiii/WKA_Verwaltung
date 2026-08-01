"use client";

/**
 * DataTable — eine Liste statt hundertneunundsechzig.
 *
 * C1 (Audit 2026-08): 157 Dateien binden `<Table>` direkt ein, 12 weitere
 * bauen ein rohes `<table>`. Jede Liste bringt Sortierung, Suche, Paginierung
 * und Leerzustand selbst mit — oder eben nicht. Von rund 169 Listen haben 29
 * einen gestalteten Leerzustand.
 *
 * ## Warum Leerzustand und Tabelle zusammengehören
 *
 * `<EmptyState>` gibt es lange und ist gut gebaut. Er wird nur selten benutzt,
 * weil er ein zusätzlicher Handgriff ist. Hier ist er keiner: die Tabelle
 * rendert ihn selbst und unterscheidet dabei „noch nichts angelegt" von
 * „Filter passt auf nichts" — zwei Zustände, die für den Nutzer völlig
 * verschieden sind und die eine handgebaute Liste fast nie trennt.
 *
 * ## Was sie ausdrücklich NICHT tut
 *
 * Sie sortiert, sucht und blättert **im Browser**, auf den übergebenen Zeilen.
 * Für serverseitig paginierte Listen ist sie damit falsch: sie würde nur die
 * gerade geladene Seite durchsuchen und dem Nutzer vorspiegeln, das sei alles.
 * Solche Listen behalten ihre eigene Steuerung; die Seitengrösse gehört dann
 * weiterhin aus `@/lib/config/pagination`.
 *
 * ## Zur Einführung
 *
 * Neue Listen nutzen sie. Bestehende werden NICHT im Block umgestellt — das
 * wäre ein Umbau über hunderte Dateien, den niemand prüfen kann. Sie ziehen
 * um, wenn ohnehin jemand in der Datei arbeitet. Dieselbe Regel wie bei
 * react-query.
 */

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface DataTableColumn<T> {
  /** Eindeutig innerhalb der Tabelle; dient als Sortierschlüssel. */
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /**
   * Wert, nach dem sortiert wird. Fehlt er, ist die Spalte nicht sortierbar —
   * das ist Absicht: eine Spalte mit Schaltflächen zu sortieren ergibt nichts,
   * und ein Kopf, der sich anklicken lässt aber nichts tut, ist schlimmer als
   * einer, der es nicht tut.
   */
  sortValue?: (row: T) => string | number | Date | null | undefined;
  /** Text, den die Suche durchsucht. Fehlt er, wird die Spalte nicht gesucht. */
  searchValue?: (row: T) => string | null | undefined;
  align?: "left" | "right";
  headerClassName?: string;
  cellClassName?: string;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;

  isLoading?: boolean;

  /** Suchfeld anzeigen. Ohne Platzhalter kein Suchfeld. */
  searchPlaceholder?: string;
  /** Zeilen pro Seite. 0 schaltet die Paginierung ab. */
  pageSize?: number;

  /** Zusätzliche Bedienelemente in der Kopfleiste (Filter, Schaltflächen). */
  toolbar?: ReactNode;

  /**
   * Sind ausserhalb der Tabelle Filter gesetzt?
   *
   * Entscheidet mit darüber, welcher Leerzustand gilt: „nichts angelegt" oder
   * „Filter passt auf nichts". Ohne diese Angabe kann die Tabelle das für
   * eigene Filter erkennen, für fremde nicht.
   */
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;

  /** Leerzustand, wenn wirklich nichts da ist. */
  empty: {
    icon?: LucideIcon;
    title: string;
    description?: string;
    action?: ReactNode;
  };

  onRowClick?: (row: T) => void;
  /** Zeile am Fuss, z. B. eine Summe. Bleibt von Suche und Sortierung unberührt. */
  footer?: ReactNode;
}

type SortState = { columnId: string; direction: "asc" | "desc" } | null;

type SortableValue = string | number | Date | null | undefined;

function isEmpty(v: SortableValue): boolean {
  return v === null || v === undefined;
}

/** Vergleich zweier GEFÜLLTER Werte. Leere behandelt `compareWithDirection`. */
function compareFilled(a: SortableValue, b: SortableValue): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "de", { numeric: true });
}

/**
 * Vergleich mit Richtung — und leere Werte IMMER am Ende.
 *
 * Die Leerwert-Regel steht bewusst ausserhalb der Richtungsumkehr. Läge sie
 * im Vergleich selbst, würde das Negieren für „absteigend" auch sie umdrehen
 * und die leeren Zeilen nach oben holen. Ein „—" an der Spitze einer
 * absteigenden Sortierung liest sich wie der grösste Wert — der Fehler, den
 * eine handgebaute Liste fast immer hat.
 */
function compareWithDirection(
  a: SortableValue,
  b: SortableValue,
  direction: "asc" | "desc",
): number {
  const aEmpty = isEmpty(a);
  const bEmpty = isEmpty(b);
  if (aEmpty || bEmpty) return aEmpty && bEmpty ? 0 : aEmpty ? 1 : -1;
  const r = compareFilled(a, b);
  return direction === "asc" ? r : -r;
}

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  isLoading = false,
  searchPlaceholder,
  pageSize = 25,
  toolbar,
  hasActiveFilters = false,
  onClearFilters,
  empty,
  onRowClick,
  footer,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);

  const searchable = columns.some((c) => c.searchValue);
  const showSearch = Boolean(searchPlaceholder) && searchable;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      columns.some((c) => {
        const v = c.searchValue?.(row);
        return v ? v.toLowerCase().includes(term) : false;
      }),
    );
  }, [rows, columns, search]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const column = columns.find((c) => c.id === sort.columnId);
    if (!column?.sortValue) return filtered;
    // Kopie, damit die übergebenen Zeilen nicht an Ort und Stelle umsortiert
    // werden — der Aufrufer hält dieselbe Referenz.
    const copy = [...filtered];
    copy.sort((a, b) =>
      compareWithDirection(column.sortValue!(a), column.sortValue!(b), sort.direction),
    );
    return copy;
  }, [filtered, columns, sort]);

  const paginated = useMemo(() => {
    if (pageSize <= 0) return sorted;
    return sorted.slice(page * pageSize, (page + 1) * pageSize);
  }, [sorted, page, pageSize]);

  const pageCount = pageSize > 0 ? Math.ceil(sorted.length / pageSize) : 1;
  // Nach einer Suche kann die aktuelle Seite hinter dem Ende liegen. Statt
  // eine leere Seite zu zeigen, wird auf die letzte vorhandene zurückgesetzt.
  const safePage = Math.min(page, Math.max(0, pageCount - 1));
  const visible = pageSize > 0 && safePage !== page ? sorted.slice(0, pageSize) : paginated;

  function toggleSort(columnId: string) {
    setPage(0);
    setSort((prev) => {
      if (prev?.columnId !== columnId) return { columnId, direction: "asc" };
      if (prev.direction === "asc") return { columnId, direction: "desc" };
      // Dritter Klick hebt die Sortierung auf — sonst gibt es keinen Weg
      // zurück zur ursprünglichen Reihenfolge.
      return null;
    });
  }

  const isFiltered = hasActiveFilters || search.trim().length > 0;

  const header =
    showSearch || toolbar ? (
      <div className="flex flex-wrap items-center gap-2">
        {showSearch && (
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
          </div>
        )}
        {toolbar}
      </div>
    ) : null;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {header}
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="space-y-3">
        {header}
        {isFiltered ? (
          <EmptyState
            kind="filtered"
            icon={empty.icon}
            title="Keine Treffer"
            description="Zu dieser Suche oder diesem Filter gibt es keine Einträge."
            onClearFilters={() => {
              setSearch("");
              onClearFilters?.();
            }}
          />
        ) : (
          <EmptyState
            icon={empty.icon}
            title={empty.title}
            description={empty.description}
            action={empty.action}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {header}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => {
                const sortable = Boolean(c.sortValue);
                const active = sort?.columnId === c.id;
                const Icon = !active
                  ? ChevronsUpDown
                  : sort!.direction === "asc"
                    ? ArrowUp
                    : ArrowDown;
                return (
                  <TableHead
                    key={c.id}
                    className={cn(
                      c.align === "right" && "text-right",
                      c.headerClassName,
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.id)}
                        className={cn(
                          "inline-flex items-center gap-1 hover:text-foreground",
                          active ? "text-foreground" : "text-muted-foreground",
                        )}
                        aria-label={`Nach ${typeof c.header === "string" ? c.header : c.id} sortieren`}
                      >
                        {c.header}
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    ) : (
                      c.header
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow
                key={getRowId(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? "cursor-pointer" : undefined}
              >
                {columns.map((c) => (
                  <TableCell
                    key={c.id}
                    className={cn(
                      c.align === "right" && "text-right",
                      c.cellClassName,
                    )}
                  >
                    {c.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {footer}
          </TableBody>
        </Table>
      </div>

      {pageSize > 0 && pageCount > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {safePage * pageSize + 1}–
            {Math.min((safePage + 1) * pageSize, sorted.length)} von {sorted.length}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
            >
              Zurück
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
            >
              Weiter
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
