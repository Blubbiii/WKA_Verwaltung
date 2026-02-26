"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import {
  ArrowLeft,
  ArrowRight,
  Send,
  Eye,
  Loader2,
  FileText,
  Users,
  CheckCircle,
  Lock,
  Mail,
  Printer,
  PenLine,
} from "lucide-react";
import { SafeHtml } from "@/components/ui/safe-html";
import RichTextEditor from "@/components/ui/rich-text-editor-dynamic";
import {
  RecipientFilterForm,
  type RecipientFilterValue,
} from "@/components/mailings/recipient-filter-form";

// =============================================================================
// Types
// =============================================================================

interface Template {
  id: string;
  name: string;
  category: string;
  subject: string;
}

interface PreviewData {
  preview: {
    subject: string;
    bodyHtml: string;
    recipientName: string;
    recipientEmail: string;
  };
  recipientCount: number;
  deliveryBreakdown?: {
    email: number;
    post: number;
    total: number;
  };
}

type ContentSource = "TEMPLATE" | "FREEFORM";
type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { step: 1 as Step, label: "Inhalt", icon: PenLine },
  { step: 2 as Step, label: "Empfaenger", icon: Users },
  { step: 3 as Step, label: "Vorschau", icon: Eye },
  { step: 4 as Step, label: "Senden", icon: Send },
];

// =============================================================================
// Inner component (needs useSearchParams -> Suspense boundary)
// =============================================================================

function CreateMailingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { flags, loading: flagsLoading } = useFeatureFlags();

  const initialMode = searchParams.get("mode") === "freeform" ? "FREEFORM" : "TEMPLATE";

  const [step, setStep] = useState<Step>(1);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Step 1: Content
  const [contentSource, setContentSource] = useState<ContentSource>(initialMode);
  const [title, setTitle] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [freeformSubject, setFreeformSubject] = useState("");
  const [freeformBody, setFreeformBody] = useState("");

  // Step 2: Recipients
  const [recipientFilter, setRecipientFilter] = useState<RecipientFilterValue>({
    type: "ALL",
  });

  // Step 3+4: Preview & Send
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [mailingId, setMailingId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // ---------------------------------------------------------------------------
  // Load templates
  // ---------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const res = await fetch("/api/mailings/templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates ?? []);
      }
    } catch {
      toast.error("Daten konnten nicht geladen werden");
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (flags.communication) loadData();
  }, [loadData, flags.communication]);

  // Feature flag guard
  if (flagsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!flags.communication) {
    return (
      <EmptyState
        icon={Lock}
        title="Modul nicht aktiviert"
        description="Das Kommunikations-Modul ist nicht aktiviert."
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Step validation
  // ---------------------------------------------------------------------------

  const canProceed = () => {
    switch (step) {
      case 1:
        if (!title.trim()) return false;
        if (contentSource === "TEMPLATE") return !!selectedTemplateId;
        return !!freeformSubject.trim() && !!freeformBody.trim();
      case 2:
        if (recipientFilter.type === "BY_FUND" && !(recipientFilter.fundIds?.length)) return false;
        if (recipientFilter.type === "BY_PARK" && !(recipientFilter.parkIds?.length)) return false;
        return true;
      case 3:
        return !!preview;
      default:
        return false;
    }
  };

  const handleNext = async () => {
    if (step === 2) {
      await createMailingAndPreview();
      return;
    }
    if (step < 4) setStep((s) => (s + 1) as Step);
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
      const payload =
        contentSource === "TEMPLATE"
          ? {
              contentSource: "TEMPLATE" as const,
              templateId: selectedTemplateId,
              title,
              recipientFilter,
            }
          : {
              contentSource: "FREEFORM" as const,
              title,
              subject: freeformSubject,
              bodyHtml: freeformBody,
              recipientFilter,
            };

      const createRes = await fetch("/api/mailings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!createRes.ok) {
        const data = await createRes.json();
        toast.error(data.error ?? "Fehler beim Erstellen");
        setLoadingPreview(false);
        return;
      }

      const { mailing } = await createRes.json();
      setMailingId(mailing.id);

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
        toast.error("Vorschau konnte nicht geladen werden");
      }
    } catch {
      toast.error("Mailing konnte nicht erstellt werden");
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
        const parts = [];
        if (data.sentCount > 0) parts.push(`${data.sentCount} E-Mails gesendet`);
        if (data.postCount > 0) parts.push(`${data.postCount} Post-Empfaenger markiert`);
        toast.success(parts.join(", ") || "Versand abgeschlossen");
        router.push("/kommunikation");
      } else {
        toast.error(data.error ?? "Fehler beim Senden");
      }
    } catch {
      toast.error("Versand fehlgeschlagen");
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Neues Mailing erstellen"
        description="Inhalt erstellen, Empfaenger waehlen und versenden."
      />

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const StepIcon = s.icon;
          const isActive = step === s.step;
          const isDone = step > s.step;

          return (
            <div key={s.step} className="flex items-center gap-2">
              {i > 0 && (
                <div className={`h-px w-8 ${isDone ? "bg-primary" : "bg-border"}`} />
              )}
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

      {/* ================================================================== */}
      {/* Step 1: Content */}
      {/* ================================================================== */}
      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Titel & Inhaltsquelle</CardTitle>
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
                <Label>Inhaltsquelle</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    className={`rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 ${
                      contentSource === "TEMPLATE"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : ""
                    }`}
                    onClick={() => setContentSource("TEMPLATE")}
                  >
                    <FileText className="h-5 w-5 mb-2 text-muted-foreground" />
                    <p className="font-medium text-sm">Vorlage</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Vorgefertigte Vorlage mit Platzhaltern
                    </p>
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 ${
                      contentSource === "FREEFORM"
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : ""
                    }`}
                    onClick={() => setContentSource("FREEFORM")}
                  >
                    <PenLine className="h-5 w-5 mb-2 text-muted-foreground" />
                    <p className="font-medium text-sm">Freitext</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Eigenen Text direkt verfassen
                    </p>
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          {contentSource === "TEMPLATE" && (
            <Card>
              <CardHeader>
                <CardTitle>Vorlage waehlen *</CardTitle>
              </CardHeader>
              <CardContent>
                {templates.length === 0 ? (
                  <div className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
                    Keine Vorlagen vorhanden.{" "}
                    <Button
                      variant="link"
                      className="p-0 h-auto"
                      onClick={() => router.push("/kommunikation/vorlagen")}
                    >
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
                          selectedTemplateId === t.id
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : ""
                        }`}
                        onClick={() => setSelectedTemplateId(t.id)}
                      >
                        <p className="font-medium text-sm">{t.name}</p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          Betreff: {t.subject}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {contentSource === "FREEFORM" && (
            <Card>
              <CardHeader>
                <CardTitle>Nachricht verfassen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Betreff *</Label>
                  <Input
                    value={freeformSubject}
                    onChange={(e) => setFreeformSubject(e.target.value)}
                    placeholder="E-Mail Betreff..."
                    maxLength={500}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nachricht *</Label>
                  <RichTextEditor
                    value={freeformBody}
                    onChange={setFreeformBody}
                    placeholder="Ihre Nachricht an die Gesellschafter..."
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* Step 2: Recipients */}
      {/* ================================================================== */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Empfaenger waehlen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RecipientFilterForm value={recipientFilter} onChange={setRecipientFilter} />
          </CardContent>
        </Card>
      )}

      {/* ================================================================== */}
      {/* Step 3: Preview */}
      {/* ================================================================== */}
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
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <Users className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-2xl font-bold">{preview.recipientCount}</p>
                        <p className="text-xs text-muted-foreground">Empfaenger gesamt</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-2xl font-bold">
                          {preview.deliveryBreakdown?.email ?? preview.recipientCount}
                        </p>
                        <p className="text-xs text-muted-foreground">per E-Mail</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <Printer className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-2xl font-bold">
                          {preview.deliveryBreakdown?.post ?? 0}
                        </p>
                        <p className="text-xs text-muted-foreground">per Post</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Content Preview */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Eye className="h-4 w-4" />
                    Vorschau (Beispiel: {preview.preview.recipientName})
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

      {/* ================================================================== */}
      {/* Step 4: Confirm & Send */}
      {/* ================================================================== */}
      {step === 4 && preview && (
        <Card>
          <CardHeader>
            <CardTitle>Zusammenfassung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Titel:</span>
                <span className="font-medium">{title}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Inhaltsquelle:</span>
                <span className="font-medium">
                  {contentSource === "TEMPLATE" ? "Vorlage" : "Freitext"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Betreff:</span>
                <span className="font-medium">{preview.preview.subject}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Empfaenger:</span>
                <span className="font-medium">{preview.recipientCount}</span>
              </div>
              {(preview.deliveryBreakdown?.post ?? 0) > 0 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">davon E-Mail:</span>
                    <span className="font-medium">{preview.deliveryBreakdown!.email}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">davon Post:</span>
                    <span className="font-medium">{preview.deliveryBreakdown!.post}</span>
                  </div>
                </>
              )}
            </div>

            {(preview.deliveryBreakdown?.post ?? 0) > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <Printer className="inline h-4 w-4 mr-1" />
                  {preview.deliveryBreakdown!.post} Empfaenger erhalten Post. Diese werden als
                  &quot;Post ausstehend&quot; markiert.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ================================================================== */}
      {/* Navigation */}
      {/* ================================================================== */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button
          variant="outline"
          onClick={step === 1 ? () => router.push("/kommunikation") : handleBack}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {step === 1 ? "Abbrechen" : "Zurueck"}
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
          ) : step === 3 ? (
            <Button onClick={() => setStep(4)} disabled={!preview}>
              <ArrowRight className="mr-2 h-4 w-4" />
              Weiter zum Senden
            </Button>
          ) : (
            <Button onClick={handleSend} disabled={sending || !preview}>
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Jetzt versenden
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Page export with Suspense for useSearchParams
// =============================================================================

export default function CreateMailingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <CreateMailingWizard />
    </Suspense>
  );
}
