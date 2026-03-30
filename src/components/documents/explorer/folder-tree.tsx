"use client";

import { FolderClosed, FolderOpen, Calendar, FileText, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { FolderNode, FolderPath } from "@/types/document-explorer";
import { useState } from "react";

interface FolderTreeProps {
  tree: FolderNode[];
  unassigned: FolderNode | null;
  loading: boolean;
  activePath: FolderPath | null;
  onSelect: (path: FolderPath) => void;
}

function CategoryItem({
  category,
  parkId,
  parkName,
  year,
  activePath,
  onSelect,
}: {
  category: { category: string; label: string; documentCount: number };
  parkId: string | null;
  parkName: string;
  year: number;
  activePath: FolderPath | null;
  onSelect: (path: FolderPath) => void;
}) {
  const isActive =
    activePath?.parkId === parkId &&
    activePath?.year === year &&
    activePath?.category === category.category;

  return (
    <button
      onClick={() =>
        onSelect({
          parkId,
          parkName,
          year,
          category: category.category,
          categoryLabel: category.label,
        })
      }
      className={`w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs transition-colors ${
        isActive
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <FileText className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate flex-1 text-left">{category.label}</span>
      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
        {category.documentCount}
      </Badge>
    </button>
  );
}

function YearItem({
  year,
  parkId,
  parkName,
  activePath,
  onSelect,
}: {
  year: { year: number; documentCount: number; categories: { category: string; label: string; documentCount: number }[] };
  parkId: string | null;
  parkName: string;
  activePath: FolderPath | null;
  onSelect: (path: FolderPath) => void;
}) {
  const [open, setOpen] = useState(
    activePath?.parkId === parkId && activePath?.year === year.year
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs hover:bg-muted transition-colors">
        <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
        <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-left font-medium">{year.year}</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
          {year.documentCount}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-5 pl-2 border-l space-y-0.5 mt-0.5">
          {year.categories.map((cat) => (
            <CategoryItem
              key={cat.category}
              category={cat}
              parkId={parkId}
              parkName={parkName}
              year={year.year}
              activePath={activePath}
              onSelect={onSelect}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ParkItem({
  node,
  activePath,
  onSelect,
}: {
  node: FolderNode;
  activePath: FolderPath | null;
  onSelect: (path: FolderPath) => void;
}) {
  const isActiveInPark = activePath?.parkId === node.parkId;
  const [open, setOpen] = useState(isActiveInPark);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors">
        {open ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
        ) : (
          <FolderClosed className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 text-left font-medium truncate">{node.parkName}</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
          {node.documentCount}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-3 pl-2 border-l space-y-0.5 mt-0.5">
          {node.years.map((y) => (
            <YearItem
              key={y.year}
              year={y}
              parkId={node.parkId}
              parkName={node.parkName}
              activePath={activePath}
              onSelect={onSelect}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function FolderTree({ tree, unassigned, loading, activePath, onSelect }: FolderTreeProps) {
  if (loading) {
    return (
      <div className="space-y-2 p-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (tree.length === 0 && !unassigned) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        Keine Dokumente vorhanden
      </div>
    );
  }

  return (
    <div className="space-y-1 p-2">
      {tree.map((node) => (
        <ParkItem key={node.parkId ?? "null"} node={node} activePath={activePath} onSelect={onSelect} />
      ))}
      {unassigned && (
        <ParkItem node={unassigned} activePath={activePath} onSelect={onSelect} />
      )}
    </div>
  );
}
