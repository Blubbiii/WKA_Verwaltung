"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Virtualized table for large datasets (500+ rows).
 * Only renders visible rows + a small overscan buffer.
 *
 * Usage:
 * ```tsx
 * <VirtualTable
 *   data={items}
 *   columns={[
 *     { header: "Name", width: 200, render: (item) => item.name },
 *     { header: "Status", width: 100, render: (item) => <Badge>{item.status}</Badge> },
 *   ]}
 *   rowHeight={48}
 *   maxHeight={600}
 *   onRowClick={(item) => router.push(`/items/${item.id}`)}
 * />
 * ```
 */

export interface VirtualColumn<T> {
  header: string;
  width?: number;
  className?: string;
  render: (item: T, index: number) => React.ReactNode;
}

interface VirtualTableProps<T> {
  data: T[];
  columns: VirtualColumn<T>[];
  rowHeight?: number;
  maxHeight?: number;
  overscan?: number;
  onRowClick?: (item: T) => void;
  getRowKey?: (item: T, index: number) => string;
  emptyMessage?: string;
  className?: string;
}

export function VirtualTable<T>({
  data,
  columns,
  rowHeight = 48,
  maxHeight = 600,
  overscan = 10,
  onRowClick,
  getRowKey,
  emptyMessage = "Keine Einträge vorhanden",
  className,
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  // TanStack Virtual returns functions that React Compiler cannot memoize safely.
  // This is a known library limitation — values are passed only to dom elements (no
  // child memoized components), so the warning can be safely suppressed.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan,
  });

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn("border rounded-lg overflow-hidden", className)}>
      {/* Fixed header */}
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col, i) => (
              <TableHead
                key={i}
                style={col.width ? { width: col.width, minWidth: col.width } : undefined}
                className={col.className}
              >
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
      </Table>

      {/* Scrollable virtualized body */}
      <div
        ref={parentRef}
        style={{ maxHeight, overflow: "auto" }}
      >
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          <Table>
            <TableBody>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const item = data[virtualRow.index];
                const key = getRowKey
                  ? getRowKey(item, virtualRow.index)
                  : String(virtualRow.index);

                return (
                  <TableRow
                    key={key}
                    style={{
                      position: "absolute",
                      top: virtualRow.start,
                      left: 0,
                      right: 0,
                      height: rowHeight,
                      display: "flex",
                      alignItems: "center",
                    }}
                    className={onRowClick ? "cursor-pointer" : undefined}
                    onClick={() => onRowClick?.(item)}
                  >
                    {columns.map((col, colIdx) => (
                      <TableCell
                        key={colIdx}
                        style={col.width ? { width: col.width, minWidth: col.width, flex: "none" } : { flex: 1 }}
                        className={cn("truncate", col.className)}
                      >
                        {col.render(item, virtualRow.index)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Row count footer */}
      <div className="px-3 py-1.5 border-t text-xs text-muted-foreground bg-muted/30">
        {data.length.toLocaleString("de-DE")} Einträge
      </div>
    </div>
  );
}
