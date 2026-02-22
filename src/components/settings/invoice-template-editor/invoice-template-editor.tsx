"use client";

// WYSIWYG Invoice Template Editor
// Layout: Left sidebar (palette) | Center (preview canvas) | Right sidebar (properties)

import { useState, useCallback, useRef } from "react";
import type {
  TemplateBlock,
  TemplateLayout,
  TemplateBlockType,
} from "@/lib/invoice-templates/template-types";
import {
  createDefaultLayout,
  generateBlockId,
  BLOCK_PALETTE,
  BLOCK_TYPE_LABELS,
} from "@/lib/invoice-templates/default-template";
import { BlockPalette } from "./block-palette";
import { BlockRenderer } from "./block-renderers";
import { PropertiesPanel } from "./properties-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Save,
  Loader2,
  RotateCcw,
  GripVertical,
  ChevronUp,
  ChevronDown,
  EyeOff,
  ArrowLeft,
} from "lucide-react";

// ============================================
// Types
// ============================================

interface InvoiceTemplateEditorProps {
  initialLayout?: TemplateLayout;
  templateName?: string;
  templateId?: string | null;
  onSave: (name: string, layout: TemplateLayout) => Promise<void>;
  onBack: () => void;
  isSaving?: boolean;
}

// ============================================
// Main Editor Component
// ============================================

export function InvoiceTemplateEditor({
  initialLayout,
  templateName: initialName = "",
  templateId: _templateId,
  onSave,
  onBack,
  isSaving = false,
}: InvoiceTemplateEditorProps) {
  const [name, setName] = useState(initialName);
  const [layout, setLayout] = useState<TemplateLayout>(
    initialLayout || createDefaultLayout()
  );
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const selectedBlock = layout.blocks.find((b) => b.id === selectedBlockId) || null;

  // Mark dirty on any change
  const markDirty = useCallback(() => setHasChanges(true), []);

  // ----------------------------------------
  // Block Operations
  // ----------------------------------------

  const updateBlocks = useCallback(
    (updater: (blocks: TemplateBlock[]) => TemplateBlock[]) => {
      setLayout((prev) => ({
        ...prev,
        blocks: updater(prev.blocks),
      }));
      markDirty();
    },
    [markDirty]
  );

  const addBlock = useCallback(
    (type: TemplateBlockType, atIndex?: number) => {
      const palItem = BLOCK_PALETTE.find((b) => b.type === type);
      if (!palItem) return;

      const newBlock: TemplateBlock = {
        id: generateBlockId(),
        type,
        order: 0,
        visible: true,
        config: { ...palItem.defaultConfig },
        style: palItem.defaultStyle ? { ...palItem.defaultStyle } : {},
      };

      updateBlocks((blocks) => {
        const newBlocks = [...blocks];
        const insertAt = atIndex !== undefined ? atIndex : newBlocks.length;
        newBlocks.splice(insertAt, 0, newBlock);
        return newBlocks.map((b, i) => ({ ...b, order: i }));
      });

      setSelectedBlockId(newBlock.id);
    },
    [updateBlocks]
  );

  const updateBlock = useCallback(
    (blockId: string, updates: Partial<TemplateBlock>) => {
      updateBlocks((blocks) =>
        blocks.map((b) =>
          b.id === blockId ? { ...b, ...updates } : b
        )
      );
    },
    [updateBlocks]
  );

  const deleteBlock = useCallback(
    (blockId: string) => {
      if (selectedBlockId === blockId) setSelectedBlockId(null);
      updateBlocks((blocks) =>
        blocks
          .filter((b) => b.id !== blockId)
          .map((b, i) => ({ ...b, order: i }))
      );
    },
    [selectedBlockId, updateBlocks]
  );

  const duplicateBlock = useCallback(
    (blockId: string) => {
      updateBlocks((blocks) => {
        const idx = blocks.findIndex((b) => b.id === blockId);
        if (idx === -1) return blocks;
        const original = blocks[idx];
        const clone: TemplateBlock = {
          ...original,
          id: generateBlockId(),
          config: { ...original.config },
          style: original.style ? { ...original.style } : undefined,
        };
        const newBlocks = [...blocks];
        newBlocks.splice(idx + 1, 0, clone);
        return newBlocks.map((b, i) => ({ ...b, order: i }));
      });
    },
    [updateBlocks]
  );

  const moveBlock = useCallback(
    (blockId: string, direction: "up" | "down") => {
      updateBlocks((blocks) => {
        const idx = blocks.findIndex((b) => b.id === blockId);
        if (idx === -1) return blocks;
        const newIdx = direction === "up" ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= blocks.length) return blocks;
        const newBlocks = [...blocks];
        [newBlocks[idx], newBlocks[newIdx]] = [newBlocks[newIdx], newBlocks[idx]];
        return newBlocks.map((b, i) => ({ ...b, order: i }));
      });
    },
    [updateBlocks]
  );

  // ----------------------------------------
  // Layout Operations
  // ----------------------------------------

  const updateLayout = useCallback(
    (updates: Partial<TemplateLayout>) => {
      setLayout((prev) => ({ ...prev, ...updates }));
      markDirty();
    },
    [markDirty]
  );

  const resetToDefault = useCallback(() => {
    setLayout(createDefaultLayout());
    setSelectedBlockId(null);
    markDirty();
  }, [markDirty]);

  // ----------------------------------------
  // Drag & Drop handlers for canvas reorder
  // ----------------------------------------

  function handleCanvasDragOver(e: React.DragEvent<HTMLDivElement>, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  }

  function handleCanvasDrop(e: React.DragEvent<HTMLDivElement>, dropIndex: number) {
    e.preventDefault();
    setDragOverIndex(null);

    // Check if this is a new block from palette
    const blockType = e.dataTransfer.getData("application/x-block-type");
    if (blockType) {
      addBlock(blockType as TemplateBlockType, dropIndex);
      return;
    }

    // Otherwise it's a reorder within canvas
    const dragBlockId = e.dataTransfer.getData("application/x-block-id");
    if (dragBlockId) {
      updateBlocks((blocks) => {
        const dragIdx = blocks.findIndex((b) => b.id === dragBlockId);
        if (dragIdx === -1) return blocks;
        const block = blocks[dragIdx];
        const newBlocks = blocks.filter((b) => b.id !== dragBlockId);
        const insertAt = dropIndex > dragIdx ? dropIndex - 1 : dropIndex;
        newBlocks.splice(insertAt, 0, block);
        return newBlocks.map((b, i) => ({ ...b, order: i }));
      });
    }
  }

  function handleBlockDragStart(e: React.DragEvent<HTMLDivElement>, blockId: string) {
    e.dataTransfer.setData("application/x-block-id", blockId);
    e.dataTransfer.effectAllowed = "move";
  }

  // ----------------------------------------
  // Save handler
  // ----------------------------------------

  async function handleSave() {
    if (!name.trim()) return;
    await onSave(name.trim(), layout);
    setHasChanges(false);
  }

  // ----------------------------------------
  // Render
  // ----------------------------------------

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b pb-3 mb-3 gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-8">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Zurueck
          </Button>
          <div className="space-y-0.5">
            <Label className="text-[10px] text-muted-foreground">Vorlagenname</Label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                markDirty();
              }}
              placeholder="z.B. Standard Rechnung"
              className="h-8 w-64 text-sm"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={resetToDefault}
            className="h-8 text-xs"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Zuruecksetzen
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className="h-8 text-xs"
          >
            {isSaving ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Save className="h-3 w-3 mr-1" />
            )}
            {hasChanges ? "Speichern *" : "Speichern"}
          </Button>
        </div>
      </div>

      {/* Three-column layout */}
      <div className="flex gap-3 flex-1 min-h-0">
        {/* Left Sidebar: Block Palette */}
        <div className="w-56 shrink-0 overflow-y-auto border rounded-lg p-3 bg-card">
          <BlockPalette onAddBlock={(type) => addBlock(type)} />
        </div>

        {/* Center: Preview Canvas */}
        <div className="flex-1 overflow-y-auto bg-muted/30 rounded-lg p-4">
          <div
            ref={canvasRef}
            className="mx-auto bg-white shadow-md rounded"
            style={{
              width: layout.pageSize === "A4" ? "595px" : "612px",
              minHeight: layout.pageSize === "A4" ? "842px" : "792px",
              padding: `${layout.margins.top * 0.75}px ${layout.margins.right * 0.75}px ${layout.margins.bottom * 0.75}px ${layout.margins.left * 0.75}px`,
              fontFamily: layout.defaultFont,
              fontSize: `${layout.defaultFontSize}px`,
              color: layout.primaryColor,
            }}
          >
            {layout.blocks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <p className="text-sm">Keine Bausteine vorhanden</p>
                <p className="text-xs mt-1">
                  Ziehen Sie Bausteine aus der linken Leiste hierher
                </p>
              </div>
            )}

            {layout.blocks.map((block, index) => (
              <div key={block.id}>
                {/* Drop zone above block */}
                <div
                  onDragOver={(e) => handleCanvasDragOver(e, index)}
                  onDragLeave={() => setDragOverIndex(null)}
                  onDrop={(e) => handleCanvasDrop(e, index)}
                  className={cn(
                    "h-1 transition-all",
                    dragOverIndex === index && "h-2 bg-primary/20 rounded"
                  )}
                />

                {/* Block wrapper */}
                <div
                  draggable
                  onDragStart={(e) => handleBlockDragStart(e, block.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedBlockId(block.id);
                  }}
                  className={cn(
                    "group relative rounded transition-all cursor-pointer",
                    selectedBlockId === block.id
                      ? "ring-2 ring-primary ring-offset-1"
                      : "hover:ring-1 hover:ring-muted-foreground/30",
                    !block.visible && "opacity-40"
                  )}
                >
                  {/* Block toolbar (on hover) */}
                  <div className="absolute -left-7 top-0 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveBlock(block.id, "up");
                      }}
                      className="p-0.5 rounded hover:bg-accent"
                      title="Nach oben"
                      aria-label="Block nach oben verschieben"
                      disabled={index === 0}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <div className="cursor-grab active:cursor-grabbing p-0.5">
                      <GripVertical className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveBlock(block.id, "down");
                      }}
                      className="p-0.5 rounded hover:bg-accent"
                      title="Nach unten"
                      aria-label="Block nach unten verschieben"
                      disabled={index === layout.blocks.length - 1}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Block type badge (on hover) */}
                  <div className="absolute -right-1 -top-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <span className="text-[9px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full whitespace-nowrap">
                      {BLOCK_TYPE_LABELS[block.type] || block.type}
                    </span>
                  </div>

                  {/* Visibility indicator */}
                  {!block.visible && (
                    <div className="absolute right-1 top-1 z-10">
                      <EyeOff className="h-3 w-3 text-muted-foreground" />
                    </div>
                  )}

                  {/* Block content */}
                  <div className="p-1">
                    <BlockRenderer block={block} />
                  </div>
                </div>
              </div>
            ))}

            {/* Drop zone at the end */}
            <div
              onDragOver={(e) => handleCanvasDragOver(e, layout.blocks.length)}
              onDragLeave={() => setDragOverIndex(null)}
              onDrop={(e) => handleCanvasDrop(e, layout.blocks.length)}
              className={cn(
                "h-8 transition-all rounded",
                dragOverIndex === layout.blocks.length
                  ? "bg-primary/20"
                  : "bg-transparent"
              )}
            />
          </div>
        </div>

        {/* Right Sidebar: Properties Panel */}
        <div className="w-64 shrink-0 overflow-y-auto border rounded-lg p-3 bg-card">
          <PropertiesPanel
            block={selectedBlock}
            layout={layout}
            onUpdateBlock={updateBlock}
            onUpdateLayout={updateLayout}
            onDeleteBlock={deleteBlock}
            onDuplicateBlock={duplicateBlock}
          />
        </div>
      </div>
    </div>
  );
}
