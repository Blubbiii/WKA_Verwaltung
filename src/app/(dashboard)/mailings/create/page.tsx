"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  ArrowRight,
  Send,
  Eye,
  Loader2,
  FileText,
  Users,
  CheckCircle,
} from "lucide-react";
import { SafeHtml } from "@/components/ui/safe-html";

// =============================================================================
// Types
// =============================================================================

interface Template {
  id: string;
  name: string;
  category: string;
  subject: string;
}

interface FundOption {
  id: string;
  name: string;
}

interface PreviewData {
  preview: {
    subject: string;
    bodyHtml: string;
    recipientName: string;
    recipientEmail: string;
  };
  recipientCount: number;
}

// =============================================================================
// Wizard steps
// =============================================================================

type Step = 1 | 2 | 3;

const STEPS = [
  { step: 1 as Step, label: "Vorlage", icon: FileText },
  { step: 2 as Step, label: "Empfänger", icon: Users },
  { step: 3 as Step, label: "Vorschau & Senden", icon: Send },
];

// =============================================================================
// Component
// =============================================================================

export default function CreateMailingPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>(1);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [funds, setFunds] = useState<FundOption[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Step 1: Template selection
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [title, setTitle] = useState("");

  // Step 2: Fund selection
  const [selectedFundId, setSelectedFundId] = useState<string>("ALL");

  // Step 3: Preview + Send
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [mailingId, setMailingId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // ---------------------------------------------------------------------------
  // Load initial data
  // ---------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [templatesRes, fundsRes] = await Promise.all([
        fetch("/api/mailings/templates"),
        fetch("/api/funds?limit=100"),
      ]);

      if (templatesRes.ok) {
        const data = await templatesRes.json();
        setTemplates(data.templates ?? []);
      }
      if (fundsRes.ok) {
        const data = await fundsRes.json();
        const fundsList = data.funds || data.data || data || [];
        setFunds(Array.isArray(fundsList) ? fundsList.map((f: { id: string; name: string }) => ({ id: f.id, name: f.name })) : []);
      }
    } catch {
      toast({ title: "Fehler", description: "Daten konnten nicht geladen werden", variant: "destructive" });
    } finally {
      setLoadingData(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---------------------------------------------------------------------------
  // Step navigation
  // ---------------------------------------------------------------------------

  const canProceed = () => {
    switch (step) {
      case 1: return !!selectedTemplateId && !!title.trim();
      case 2: return true; // "ALL" is a valid selection
      case 3: return !!preview;
      default: return false;
    }
  };

  const handleNext = async () => {
    if (step === 2) {
      // Create the mailing draft and load preview
      await createMailingAndPreview();
      return;
    }
    if (step < 3) setStep((s) => (s + 1) as Step);
  };

  const handleBack = () => {
    if (step > 1) setStep((s) => (s - 1) as Step);
  };

  // ---------------------------------------------------------------------------
  // Create mailing draft + load preview
  // ---------------------------------------------------------------------------

  const createMailingAndPreview = async () => {
    setLoadingPreview(true);
    try {
      // Create mailing draft
      const createRes = await fetch("/api/mailings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplateId,
          fundId: selectedFundId !== "ALL" ? selectedFundId : undefined,
          title,
        }),
      });

      if (!createRes.ok) {
        const data = await createRes.json();
        toast({ title: "Fehler", description: data.error, variant: "destructive" });
        setLoadingPreview(false);
        return;
      }

      const { mailing } = await createRes.json();
      setMailingId(mailing.id);

      // Load preview
      const previewRes = await fetch(`/api/mailings/${mailing.id}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (previewRes.ok) {
        const previewData = await previewRes.json();
        setPreview(previewData);
        setStep(3);
      } else {
        toast({ title: "Fehler", description: "Vorschau konnte nicht geladen werden", variant: "destructive" });
      }
    } catch {
      toast({ title: "Fehler", description: "Mailing konnte nicht erstellt werden", variant: "destructive" });
    } finally {
      setLoadingPreview(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Send
  // ---------------------------------------------------------------------------

  const handleSend = async () => {
    if (!mailingId) return;
    setSending(true);
    try {
      const res = await fetch(`/api/mailings/${mailingId}/send`, { method: "POST" });
      const data = await res.json();

      if (res.ok) {
        toast({
          title: "Mailing gesendet",
          description: `${data.sentCount} von ${data.totalRecipients} E-Mails erfolgreich gesendet.`,
        });
        router.push("/mailings");
      } else {
        toast({ title: "Fehler", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Fehler", description: "Versand fehlgeschlagen", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loadingData) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-60" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Neues Mailing erstellen"
        description="Wählen Sie eine Vorlage, bestimmen Sie die Empfänger und senden Sie."
      />

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const StepIcon = s.icon;
          const isActive = step === s.step;
          const isDone = step > s.step;

          return (
            <div key={s.step} className="flex items-center gap-2">
              {i > 0 && <div className={`h-px w-8 ${isDone ? "bg-primary" : "bg-border"}`} />}
              <div
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isDone
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? <CheckCircle className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
                {s.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Step 1: Template Selection */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Vorlage & Titel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Mailing-Titel *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="z.B. GV-Einladung Windpark Nord 2026"
              />
            </div>
            <div className="space-y-2">
              <Label>Vorlage *</Label>
              {templates.length === 0 ? (
                <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
                  Keine Vorlagen vorhanden.{" "}
                  <Button variant="link" className="p-0 h-auto" onClick={() => router.push("/mailings/templates")}>
                    Vorlage erstellen
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 ${
                        selectedTemplateId === t.id ? "border-primary bg-primary/5 ring-1 ring-primary" : ""
                      }`}
                      onClick={() => setSelectedTemplateId(t.id)}
                    >
                      <p className="font-medium text-sm">{t.name}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">Betreff: {t.subject}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Recipient Selection */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Empfänger wählen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Gesellschaft</Label>
              <Select value={selectedFundId} onValueChange={setSelectedFundId}>
                <SelectTrigger>
                  <SelectValue placeholder="Alle Gesellschaften" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Alle Gesellschaften</SelectItem>
                  {funds.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Wählen Sie eine Gesellschaft oder &quot;Alle&quot; um an alle Gesellschafter zu senden.
              </p>
            </div>

            {selectedTemplate && (
              <div className="rounded-lg border p-4 bg-muted/30">
                <p className="text-sm font-medium">Ausgewählte Vorlage: {selectedTemplate.name}</p>
                <p className="text-xs text-muted-foreground mt-1">Betreff: {selectedTemplate.subject}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Preview & Send */}
      {step === 3 && (
        <div className="space-y-4">
          {loadingPreview ? (
            <Card>
              <CardContent className="py-8">
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm text-muted-foreground">Vorschau wird geladen...</span>
                </div>
              </CardContent>
            </Card>
          ) : preview ? (
            <>
              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <Users className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-2xl font-bold">{preview.recipientCount}</p>
                        <p className="text-xs text-muted-foreground">Empfänger</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <Eye className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{preview.preview.recipientName}</p>
                        <p className="text-xs text-muted-foreground">{preview.preview.recipientEmail}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Email preview */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Eye className="h-4 w-4" />
                    Vorschau (Beispiel-Empfänger)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border p-4 bg-background">
                    <p className="text-sm font-medium mb-3">
                      Betreff: {preview.preview.subject}
                    </p>
                    <div className="border-t pt-3">
                      <SafeHtml
                        html={preview.preview.bodyHtml}
                        className="prose prose-sm dark:prose-invert max-w-none"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button
          variant="outline"
          onClick={step === 1 ? () => router.push("/mailings") : handleBack}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {step === 1 ? "Abbrechen" : "Zurück"}
        </Button>

        <div className="flex gap-2">
          {step < 3 ? (
            <Button onClick={handleNext} disabled={!canProceed() || loadingPreview}>
              {loadingPreview ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" />
              )}
              Weiter
            </Button>
          ) : (
            <Button onClick={handleSend} disabled={sending || !preview}>
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              An {preview?.recipientCount ?? 0} Empfänger senden
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
