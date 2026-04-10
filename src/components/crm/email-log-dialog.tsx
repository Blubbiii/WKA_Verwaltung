"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("crm.emailLog");
  const tCommon = useTranslations("common");
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
    const tpl = templates.find((x) => x.id === templateId);
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
      toast.error(t("validationMissing"));
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
        throw new Error(err.error ?? t("errorMessage"));
      }
      toast.success(t("successMessage"));
      onSuccess?.();
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("errorMessage"));
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
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {templates.length > 0 && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                <Sparkles className="h-3 w-3" />
                {t("templateField")}
              </Label>
              <Select
                value={selectedTemplateId}
                onValueChange={applyTemplate}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("templateNone")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("templateNone")}</SelectItem>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t("directionField")}</Label>
            <RadioGroup
              value={direction}
              onValueChange={(v) => setDirection(v as "OUTBOUND" | "INBOUND")}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="OUTBOUND" id="dir-out" />
                <Label
                  htmlFor="dir-out"
                  className="cursor-pointer font-normal"
                >
                  {t("directionOutbound")}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="INBOUND" id="dir-in" />
                <Label htmlFor="dir-in" className="cursor-pointer font-normal">
                  {t("directionInbound")}
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("fromField")}</Label>
              <Input
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder={t("fromPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("toField")}</Label>
              <Input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder={t("toPlaceholder")}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("ccField")}</Label>
            <Input
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder={t("ccPlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("subjectField")}</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("bodyField")}</Label>
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
            {tCommon("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? t("submitting") : t("submitButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
