"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  renderTemplate,
  type TemplateContext,
} from "@/lib/crm/template-renderer";

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
}

interface EmailLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string;
  personContext: TemplateContext;
  onSuccess?: () => void;
}

export function EmailLogDialog({
  open,
  onOpenChange,
  personId,
  personContext,
  onSuccess,
}: EmailLogDialogProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("none");
  const [direction, setDirection] = useState<"OUTBOUND" | "INBOUND">("OUTBOUND");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/crm/email-templates")
      .then((r) => (r.ok ? r.json() : []))
      .then(setTemplates)
      .catch(() => {});
    // Pre-fill recipient when outbound
    if (personContext.person?.email) {
      setTo(personContext.person.email);
    }
  }, [open, personContext.person?.email]);

  const supportedTokens = useMemo(() => personContext, [personContext]);

  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId === "none") return;
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    setSubject(renderTemplate(tpl.subject, supportedTokens));
    setBody(renderTemplate(tpl.htmlContent, supportedTokens));
  };

  const reset = () => {
    setSelectedTemplateId("none");
    setFrom("");
    setTo("");
    setCc("");
    setSubject("");
    setBody("");
    setDirection("OUTBOUND");
  };

  const handleSubmit = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("Betreff und Inhalt sind Pflicht");
      return;
    }
    setSaving(true);
    try {
      const emailToList = to
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const emailCcList = cc
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch("/api/crm/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "EMAIL",
          title: subject,
          description: body,
          status: "DONE",
          direction,
          personId,
          emailFrom: from || null,
          emailTo: emailToList,
          emailCc: emailCcList,
          emailSubject: subject,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Fehler");
      }
      toast.success("E-Mail protokolliert");
      onSuccess?.();
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            E-Mail protokollieren
          </DialogTitle>
          <DialogDescription>
            Halte eine gesendete oder empfangene E-Mail als Aktivität fest.
            Optional kannst du ein Template als Ausgangspunkt verwenden.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {templates.length > 0 && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                <Sparkles className="h-3 w-3" />
                Template einfügen
              </Label>
              <Select
                value={selectedTemplateId}
                onValueChange={applyTemplate}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kein Template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Kein Template</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Richtung</Label>
            <RadioGroup
              value={direction}
              onValueChange={(v) => setDirection(v as "OUTBOUND" | "INBOUND")}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="OUTBOUND" id="dir-out" />
                <Label htmlFor="dir-out" className="cursor-pointer font-normal">
                  Ausgehend
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="INBOUND" id="dir-in" />
                <Label htmlFor="dir-in" className="cursor-pointer font-normal">
                  Eingehend
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Von</Label>
              <Input
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="ich@firma.de"
              />
            </div>
            <div className="space-y-1.5">
              <Label>An (komma-separiert)</Label>
              <Input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="kontakt@beispiel.de"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Cc (optional, komma-separiert)</Label>
            <Input
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="kollege@firma.de"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Betreff</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Inhalt</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="font-mono text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Speichert..." : "Protokollieren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
