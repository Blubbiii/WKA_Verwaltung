"use client";

// Properties panel (right sidebar) - shows configuration for the selected block

import type { TemplateBlock, TemplateLayout } from "@/lib/invoice-templates/template-types";
import { BLOCK_TYPE_LABELS } from "@/lib/invoice-templates/default-template";
import { MERGE_VARIABLES } from "@/lib/invoice-templates/template-types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, Trash2, Copy } from "lucide-react";

interface PropertiesPanelProps {
  block: TemplateBlock | null;
  layout: TemplateLayout;
  onUpdateBlock: (blockId: string, updates: Partial<TemplateBlock>) => void;
  onUpdateLayout: (updates: Partial<TemplateLayout>) => void;
  onDeleteBlock: (blockId: string) => void;
  onDuplicateBlock: (blockId: string) => void;
}

export function PropertiesPanel({
  block,
  layout,
  onUpdateBlock,
  onUpdateLayout,
  onDeleteBlock,
  onDuplicateBlock,
}: PropertiesPanelProps) {
  // When no block is selected, show layout properties
  if (!block) {
    return <LayoutProperties layout={layout} onUpdateLayout={onUpdateLayout} />;
  }

  // Update a config value
  function updateConfig(key: string, value: unknown) {
    if (!block) return;
    onUpdateBlock(block.id, {
      config: { ...block.config, [key]: value },
    });
  }

  // Update a style value
  function updateStyle(key: string, value: unknown) {
    if (!block) return;
    onUpdateBlock(block.id, {
      style: { ...block.style, [key]: value },
    });
  }

  const mergeVars = MERGE_VARIABLES[block.type] || [];

  return (
    <div className="space-y-4">
      {/* Block Header */}
      <div>
        <h3 className="text-sm font-semibold">
          {BLOCK_TYPE_LABELS[block.type] || block.type}
        </h3>
        <p className="text-xs text-muted-foreground">Block-Einstellungen</p>
      </div>

      {/* Visibility Toggle */}
      <div className="flex items-center justify-between">
        <Label className="text-xs">Sichtbar</Label>
        <Button
          variant={block.visible ? "default" : "outline"}
          size="sm"
          onClick={() => onUpdateBlock(block.id, { visible: !block.visible })}
          className="h-7 text-xs"
        >
          {block.visible ? (
            <>
              <Eye className="h-3 w-3 mr-1" /> Sichtbar
            </>
          ) : (
            <>
              <EyeOff className="h-3 w-3 mr-1" /> Ausgeblendet
            </>
          )}
        </Button>
      </div>

      <Separator />

      {/* Block-specific config */}
      <BlockConfigEditor block={block} updateConfig={updateConfig} />

      <Separator />

      {/* Style Properties */}
      <div className="space-y-3">
        <Label className="text-xs font-medium">Darstellung</Label>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Schriftgroesse</Label>
            <Input
              type="number"
              min={6}
              max={24}
              value={block.style?.fontSize || ""}
              onChange={(e) => updateStyle("fontSize", e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="Auto"
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Schriftstil</Label>
            <Select
              value={block.style?.fontWeight || "normal"}
              onValueChange={(v) => updateStyle("fontWeight", v)}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="bold">Fett</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Ausrichtung</Label>
          <Select
            value={block.style?.textAlign || "left"}
            onValueChange={(v) => updateStyle("textAlign", v)}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Links</SelectItem>
              <SelectItem value="center">Zentriert</SelectItem>
              <SelectItem value="right">Rechts</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Abstand oben (px)</Label>
            <Input
              type="number"
              min={0}
              max={64}
              value={block.style?.marginTop || ""}
              onChange={(e) => updateStyle("marginTop", e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="0"
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Abstand unten (px)</Label>
            <Input
              type="number"
              min={0}
              max={64}
              value={block.style?.marginBottom || ""}
              onChange={(e) => updateStyle("marginBottom", e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="0"
              className="h-7 text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Innenabstand (px)</Label>
            <Input
              type="number"
              min={0}
              max={32}
              value={block.style?.padding || ""}
              onChange={(e) => updateStyle("padding", e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="0"
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Hintergrund</Label>
            <Input
              value={(block.style?.backgroundColor as string) || ""}
              onChange={(e) => updateStyle("backgroundColor", e.target.value || undefined)}
              placeholder="#ffffff"
              className="h-7 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Merge Variables */}
      {mergeVars.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <Label className="text-xs font-medium">Verfuegbare Platzhalter</Label>
            <div className="flex flex-wrap gap-1">
              {mergeVars.map((v) => (
                <Badge key={v.key} variant="outline" className="text-[10px] font-mono cursor-help" title={v.label}>
                  {v.key}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}

      <Separator />

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDuplicateBlock(block.id)}
          className="flex-1 h-7 text-xs"
        >
          <Copy className="h-3 w-3 mr-1" />
          Duplizieren
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => onDeleteBlock(block.id)}
          className="flex-1 h-7 text-xs"
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Entfernen
        </Button>
      </div>
    </div>
  );
}

// ============================================
// Layout Properties (shown when no block selected)
// ============================================

function LayoutProperties({
  layout,
  onUpdateLayout,
}: {
  layout: TemplateLayout;
  onUpdateLayout: (updates: Partial<TemplateLayout>) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Seiteneinstellungen</h3>
        <p className="text-xs text-muted-foreground">
          Klicken Sie auf einen Block in der Vorschau um ihn zu bearbeiten
        </p>
      </div>

      <Separator />

      {/* Page Size */}
      <div className="space-y-1">
        <Label className="text-xs">Seitenformat</Label>
        <Select
          value={layout.pageSize}
          onValueChange={(v) => onUpdateLayout({ pageSize: v as "A4" | "LETTER" })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="A4">A4 (210 x 297 mm)</SelectItem>
            <SelectItem value="LETTER">Letter (216 x 279 mm)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Margins */}
      <div className="space-y-2">
        <Label className="text-xs">Seitenraender (mm)</Label>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Oben</Label>
            <Input
              type="number"
              min={10}
              max={80}
              value={layout.margins.top}
              onChange={(e) =>
                onUpdateLayout({ margins: { ...layout.margins, top: parseInt(e.target.value) || 45 } })
              }
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Unten</Label>
            <Input
              type="number"
              min={10}
              max={80}
              value={layout.margins.bottom}
              onChange={(e) =>
                onUpdateLayout({ margins: { ...layout.margins, bottom: parseInt(e.target.value) || 30 } })
              }
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Links</Label>
            <Input
              type="number"
              min={10}
              max={50}
              value={layout.margins.left}
              onChange={(e) =>
                onUpdateLayout({ margins: { ...layout.margins, left: parseInt(e.target.value) || 25 } })
              }
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Rechts</Label>
            <Input
              type="number"
              min={10}
              max={50}
              value={layout.margins.right}
              onChange={(e) =>
                onUpdateLayout({ margins: { ...layout.margins, right: parseInt(e.target.value) || 20 } })
              }
              className="h-7 text-xs"
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Typography */}
      <div className="space-y-2">
        <Label className="text-xs">Typografie</Label>
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Schriftart</Label>
            <Select
              value={layout.defaultFont}
              onValueChange={(v) => onUpdateLayout({ defaultFont: v })}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Inter">Inter</SelectItem>
                <SelectItem value="Helvetica">Helvetica</SelectItem>
                <SelectItem value="Arial">Arial</SelectItem>
                <SelectItem value="Times New Roman">Times New Roman</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Standard-Schriftgroesse</Label>
            <Input
              type="number"
              min={8}
              max={16}
              value={layout.defaultFontSize}
              onChange={(e) =>
                onUpdateLayout({ defaultFontSize: parseInt(e.target.value) || 10 })
              }
              className="h-7 text-xs"
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Colors */}
      <div className="space-y-2">
        <Label className="text-xs">Farben</Label>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Primaerfarbe</Label>
            <div className="flex gap-1">
              <Input
                value={layout.primaryColor}
                onChange={(e) => onUpdateLayout({ primaryColor: e.target.value })}
                className="h-7 text-xs flex-1"
              />
              <div
                className="w-7 h-7 rounded border shrink-0"
                style={{ backgroundColor: layout.primaryColor }}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Akzentfarbe</Label>
            <div className="flex gap-1">
              <Input
                value={layout.accentColor}
                onChange={(e) => onUpdateLayout({ accentColor: e.target.value })}
                className="h-7 text-xs flex-1"
              />
              <div
                className="w-7 h-7 rounded border shrink-0"
                style={{ backgroundColor: layout.accentColor }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Block Config Editor (different UI per type)
// ============================================

function BlockConfigEditor({
  block,
  updateConfig,
}: {
  block: TemplateBlock;
  updateConfig: (key: string, value: unknown) => void;
}) {
  const config = block.config;

  switch (block.type) {
    case "HEADER":
      return (
        <div className="space-y-2">
          <Label className="text-xs font-medium">Kopfzeile</Label>
          <ConfigSwitch label="Logo anzeigen" value={config.showLogo as boolean} onChange={(v) => updateConfig("showLogo", v)} />
          <ConfigSwitch label="Firmenname anzeigen" value={config.showCompanyName as boolean} onChange={(v) => updateConfig("showCompanyName", v)} />
          <ConfigSwitch label="Adresse anzeigen" value={config.showCompanyAddress as boolean} onChange={(v) => updateConfig("showCompanyAddress", v)} />
        </div>
      );

    case "SENDER_ADDRESS":
      return (
        <div className="space-y-2">
          <Label className="text-xs font-medium">Absender</Label>
          <ConfigSwitch label="Kompaktdarstellung" value={config.compact as boolean} onChange={(v) => updateConfig("compact", v)} />
        </div>
      );

    case "RECIPIENT_ADDRESS":
      return (
        <div className="space-y-2">
          <Label className="text-xs font-medium">Empfaenger</Label>
          <ConfigSwitch label="Fensterumschlag (DIN 5008)" value={config.showWindow as boolean} onChange={(v) => updateConfig("showWindow", v)} />
        </div>
      );

    case "INVOICE_META":
      return (
        <div className="space-y-2">
          <Label className="text-xs font-medium">Angezeigte Felder</Label>
          <ConfigSwitch label="Rechnungsnummer" value={config.showInvoiceNumber as boolean} onChange={(v) => updateConfig("showInvoiceNumber", v)} />
          <ConfigSwitch label="Rechnungsdatum" value={config.showDate as boolean} onChange={(v) => updateConfig("showDate", v)} />
          <ConfigSwitch label="Faelligkeitsdatum" value={config.showDueDate as boolean} onChange={(v) => updateConfig("showDueDate", v)} />
          <ConfigSwitch label="Leistungszeitraum" value={config.showServicePeriod as boolean} onChange={(v) => updateConfig("showServicePeriod", v)} />
          <ConfigSwitch label="Kundennummer" value={config.showCustomerNumber as boolean} onChange={(v) => updateConfig("showCustomerNumber", v)} />
          <ConfigSwitch label="Zahlungsreferenz" value={config.showPaymentReference as boolean} onChange={(v) => updateConfig("showPaymentReference", v)} />
        </div>
      );

    case "POSITIONS_TABLE":
      return (
        <div className="space-y-2">
          <Label className="text-xs font-medium">Sichtbare Spalten</Label>
          <ConfigSwitch label="Position" value={config.showPosition as boolean} onChange={(v) => updateConfig("showPosition", v)} />
          <ConfigSwitch label="Menge" value={config.showQuantity as boolean} onChange={(v) => updateConfig("showQuantity", v)} />
          <ConfigSwitch label="Einheit" value={config.showUnit as boolean} onChange={(v) => updateConfig("showUnit", v)} />
          <ConfigSwitch label="Einzelpreis" value={config.showUnitPrice as boolean} onChange={(v) => updateConfig("showUnitPrice", v)} />
          <ConfigSwitch label="MwSt-Satz" value={config.showTaxRate as boolean} onChange={(v) => updateConfig("showTaxRate", v)} />
          <ConfigSwitch label="Nettobetrag" value={config.showNetAmount as boolean} onChange={(v) => updateConfig("showNetAmount", v)} />
          <ConfigSwitch label="Bruttobetrag" value={config.showGrossAmount as boolean} onChange={(v) => updateConfig("showGrossAmount", v)} />
        </div>
      );

    case "TOTAL":
      return (
        <div className="space-y-2">
          <Label className="text-xs font-medium">Gesamtbetrag</Label>
          <ConfigSwitch label="Bruttosumme anzeigen" value={config.showGrossTotal as boolean} onChange={(v) => updateConfig("showGrossTotal", v)} />
          <ConfigSwitch label="Hervorheben (Hintergrund)" value={config.highlight as boolean} onChange={(v) => updateConfig("highlight", v)} />
        </div>
      );

    case "PAYMENT_INFO":
      return (
        <div className="space-y-2">
          <Label className="text-xs font-medium">Zahlungsinformationen</Label>
          <ConfigSwitch label="Zahlungsbedingungen" value={config.showPaymentTerms as boolean} onChange={(v) => updateConfig("showPaymentTerms", v)} />
          <ConfigSwitch label="Skonto-Hinweis" value={config.showSkonto as boolean} onChange={(v) => updateConfig("showSkonto", v)} />
        </div>
      );

    case "BANK_DETAILS":
      return (
        <div className="space-y-2">
          <Label className="text-xs font-medium">Bankverbindung</Label>
          <ConfigSwitch label="Bankname" value={config.showBankName as boolean} onChange={(v) => updateConfig("showBankName", v)} />
          <ConfigSwitch label="IBAN" value={config.showIban as boolean} onChange={(v) => updateConfig("showIban", v)} />
          <ConfigSwitch label="BIC" value={config.showBic as boolean} onChange={(v) => updateConfig("showBic", v)} />
        </div>
      );

    case "NOTES":
      return (
        <div className="space-y-2">
          <Label className="text-xs font-medium">Standard-Notiztext</Label>
          <Textarea
            value={(config.defaultText as string) || ""}
            onChange={(e) => updateConfig("defaultText", e.target.value)}
            placeholder="Optionaler Standard-Text..."
            rows={3}
            className="text-xs"
          />
        </div>
      );

    case "FOOTER":
      return (
        <div className="space-y-2">
          <Label className="text-xs font-medium">Fusszeile</Label>
          <ConfigSwitch label="Steuerhinweis" value={config.showTaxDisclaimer as boolean} onChange={(v) => updateConfig("showTaxDisclaimer", v)} />
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Eigener Text</Label>
            <Textarea
              value={(config.customText as string) || ""}
              onChange={(e) => updateConfig("customText", e.target.value)}
              placeholder="z.B. Geschaeftsfuehrer, Handelsregister..."
              rows={2}
              className="text-xs"
            />
          </div>
        </div>
      );

    case "CUSTOM_TEXT":
      return (
        <div className="space-y-2">
          <Label className="text-xs font-medium">Freitext</Label>
          <Textarea
            value={(config.text as string) || ""}
            onChange={(e) => updateConfig("text", e.target.value)}
            placeholder="Text mit {{platzhaltern}} eingeben..."
            rows={4}
            className="text-xs font-mono"
          />
          <p className="text-[10px] text-muted-foreground">
            Verwenden Sie Platzhalter wie {`{{companyName}}`} oder {`{{invoiceNumber}}`}
          </p>
        </div>
      );

    case "SPACER":
      return (
        <div className="space-y-2">
          <Label className="text-xs font-medium">Abstand</Label>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Hoehe (px)</Label>
            <Input
              type="number"
              min={4}
              max={100}
              value={(config.height as number) || 24}
              onChange={(e) => updateConfig("height", parseInt(e.target.value) || 24)}
              className="h-7 text-xs"
            />
          </div>
        </div>
      );

    case "DIVIDER":
      return (
        <div className="space-y-2">
          <Label className="text-xs font-medium">Trennlinie</Label>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Staerke (px)</Label>
            <Input
              type="number"
              min={1}
              max={5}
              value={(config.thickness as number) || 1}
              onChange={(e) => updateConfig("thickness", parseInt(e.target.value) || 1)}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Farbe</Label>
            <Input
              value={(config.color as string) || "#e5e7eb"}
              onChange={(e) => updateConfig("color", e.target.value)}
              className="h-7 text-xs"
            />
          </div>
        </div>
      );

    default:
      return null;
  }
}

// ============================================
// Config Switch (reusable toggle)
// ============================================

function ConfigSwitch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Switch
        checked={value ?? false}
        onCheckedChange={onChange}
        className="scale-75"
      />
    </div>
  );
}
