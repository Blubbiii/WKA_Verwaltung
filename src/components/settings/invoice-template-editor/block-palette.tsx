"use client";

// Block palette (left sidebar) - draggable blocks grouped by category

import { BLOCK_PALETTE, CATEGORY_LABELS } from "@/lib/invoice-templates/default-template";
import type { TemplateBlockType } from "@/lib/invoice-templates/template-types";
import {
  LayoutTemplate,
  MapPin,
  User,
  MoveVertical,
  Minus,
  FileText,
  StickyNote,
  Type,
  Table,
  Calculator,
  Percent,
  BadgeEuro,
  CreditCard,
  Landmark,
  AlignEndHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Map icon names to components
const ICON_MAP: Record<string, LucideIcon> = {
  LayoutTemplate,
  MapPin,
  User,
  MoveVertical,
  Minus,
  FileText,
  StickyNote,
  Type,
  Table,
  Calculator,
  Percent,
  BadgeEuro,
  CreditCard,
  Landmark,
  AlignEndHorizontal,
};

interface BlockPaletteProps {
  onAddBlock: (type: TemplateBlockType) => void;
}

export function BlockPalette({ onAddBlock }: BlockPaletteProps) {
  // Group blocks by category
  const grouped = BLOCK_PALETTE.reduce<Record<string, typeof BLOCK_PALETTE>>(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    },
    {}
  );

  function handleDragStart(
    e: React.DragEvent<HTMLDivElement>,
    type: TemplateBlockType
  ) {
    e.dataTransfer.setData("application/x-block-type", type);
    e.dataTransfer.effectAllowed = "copy";
  }

  return (
    <div className="space-y-4">
      <div className="px-1">
        <h3 className="text-sm font-semibold mb-1">Bausteine</h3>
        <p className="text-xs text-muted-foreground">
          Ziehen Sie Bausteine in die Vorschau oder klicken Sie zum Hinzufügen
        </p>
      </div>

      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 px-1">
            {CATEGORY_LABELS[category] || category}
          </div>
          <div className="space-y-1">
            {items.map((item) => {
              const IconComponent = ICON_MAP[item.icon];
              return (
                <div
                  key={item.type}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item.type)}
                  onClick={() => onAddBlock(item.type)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-grab hover:bg-accent transition-colors border border-transparent hover:border-border active:cursor-grabbing"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onAddBlock(item.type);
                    }
                  }}
                  aria-label={`${item.label} hinzufügen`}
                >
                  {IconComponent && (
                    <IconComponent className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{item.label}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {item.description}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
