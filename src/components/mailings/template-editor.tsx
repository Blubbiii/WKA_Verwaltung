"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import RichTextEditor from "@/components/ui/rich-text-editor-dynamic";
import { STANDARD_PLACEHOLDERS } from "@/lib/mailings/placeholder-service";

// =============================================================================
// Types
// =============================================================================

interface TemplateData {
  id?: string;
  name: string;
  category: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  variables: Array<{ key: string; label: string; example: string }>;
  isDefault: boolean;
}

interface TemplateEditorProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  template: TemplateData | null;
}

const CATEGORIES = [
  { value: "GV_EINLADUNG", label: "GV-Einladung" },
  { value: "QUARTALSBERICHT", label: "Quartalsbericht" },
  { value: "JAHRESABSCHLUSS", label: "Jahresabschluss" },
  { value: "MAHNUNG", label: "Mahnung" },
  { value: "INFORMATION", label: "Information" },
  { value: "CUSTOM", label: "Benutzerdefiniert" },
];

// =============================================================================
// Component
// =============================================================================

export function TemplateEditor({ open, onClose, onSaved, template }: TemplateEditorProps) {
  const { toast } = useToast();
  const isEdit = !!template?.id;

  const [name, setName] = useState(template?.name ?? "");
  const [category, setCategory] = useState(template?.category ?? "CUSTOM");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [bodyHtml, setBodyHtml] = useState(template?.bodyHtml ?? "");
  const [saving, setSaving] = useState(false);

  const insertPlaceholder = (key: string, target: "subject" | "body") => {
    const placeholder = `{${key}}`;
    if (target === "subject") {
      setSubject((prev) => prev + placeholder);
    } else {
      setBodyHtml((prev) => prev + placeholder);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !subject.trim() || !bodyHtml.trim()) {
      toast({ title: "Fehler", description: "Bitte füllen Sie alle Pflichtfelder aus", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        category,
        subject,
        bodyHtml,
        bodyText: null,
        variables: STANDARD_PLACEHOLDERS,
      };

      const url = isEdit
        ? `/api/mailings/templates/${template!.id}`
        : "/api/mailings/templates";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast({ title: isEdit ? "Vorlage aktualisiert" : "Vorlage erstellt" });
        onSaved();
      } else {
        const data = await res.json();
        toast({ title: "Fehler", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Fehler", description: "Speichern fehlgeschlagen", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Vorlage bearbeiten" : "Neue Vorlage erstellen"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Name + Category */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Name *</Label>
              <Input
                id="template-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. GV-Einladung 2026"
              />
            </div>
            <div className="space-y-2">
              <Label>Kategorie *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="template-subject">Betreff *</Label>
            <Input
              id="template-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="z.B. Einladung zur Gesellschafterversammlung {gesellschaft}"
            />
          </div>

          {/* Placeholder buttons */}
          <div className="space-y-2">
            <Label>Platzhalter einfügen</Label>
            <div className="flex flex-wrap gap-1.5">
              {STANDARD_PLACEHOLDERS.map((p) => (
                <Badge
                  key={p.key}
                  variant="outline"
                  className="cursor-pointer hover:bg-muted transition-colors"
                  onClick={() => insertPlaceholder(p.key, "body")}
                  title={`${p.label}: ${p.example}`}
                >
                  {`{${p.key}}`}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Klicken Sie auf einen Platzhalter, um ihn in den Text einzufügen
            </p>
          </div>

          {/* Body */}
          <div className="space-y-2">
            <Label>Inhalt *</Label>
            <RichTextEditor
              value={bodyHtml}
              onChange={setBodyHtml}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Abbrechen
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? "Speichern" : "Erstellen"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
