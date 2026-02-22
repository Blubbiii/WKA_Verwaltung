"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Stepper, StepContent, StepActions } from "@/components/ui/stepper";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Shield,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import {
  StepPersonalData,
  StepParticipation,
  StepPortalAccess,
  StepDocuments,
  StepReview,
} from "./onboarding-steps";
import {
  WIZARD_STEPS,
  getInitialFormData,
  type OnboardingFormData,
  type PersonalData,
  type ParticipationData,
  type OnboardingResult,
} from "./onboarding-types";

// Validation helpers
function validatePersonalData(data: PersonalData): Partial<Record<keyof PersonalData, string>> {
  const errors: Partial<Record<keyof PersonalData, string>> = {};
  if (!data.firstName.trim()) errors.firstName = "Vorname ist erforderlich";
  if (!data.lastName.trim()) errors.lastName = "Nachname ist erforderlich";
  if (!data.email.trim()) {
    errors.email = "E-Mail ist erforderlich";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = "Bitte eine gueltige E-Mail-Adresse eingeben";
  }
  return errors;
}

function validateParticipation(data: ParticipationData): Partial<Record<keyof ParticipationData, string>> {
  const errors: Partial<Record<keyof ParticipationData, string>> = {};
  if (!data.fundId) errors.fundId = "Bitte eine Gesellschaft auswaehlen";
  if (!data.capitalContribution || parseFloat(data.capitalContribution) <= 0) {
    errors.capitalContribution = "Kapitalanteil muss groesser als 0 sein";
  }
  if (!data.entryDate) errors.entryDate = "Beitrittsdatum ist erforderlich";
  return errors;
}

export function OnboardingWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<OnboardingFormData>(getInitialFormData());
  const [personalErrors, setPersonalErrors] = useState<Partial<Record<keyof PersonalData, string>>>({});
  const [participationErrors, setParticipationErrors] = useState<Partial<Record<keyof ParticipationData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Result dialog state
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [onboardingResult, setOnboardingResult] = useState<OnboardingResult | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const canGoNext = useCallback(() => {
    switch (currentStep) {
      case 0: {
        const errors = validatePersonalData(formData.personalData);
        return Object.keys(errors).length === 0;
      }
      case 1: {
        const errors = validateParticipation(formData.participation);
        return Object.keys(errors).length === 0;
      }
      case 2:
        // Portal access step - always valid (optional)
        if (formData.portalAccess.createPortalAccess && !formData.personalData.email) {
          return false;
        }
        return true;
      case 3:
        // Documents step - always valid (optional)
        return true;
      case 4:
        // Review step - always valid
        return true;
      default:
        return false;
    }
  }, [currentStep, formData]);

  function handleNext() {
    setSubmitError(null);

    // Validate current step
    switch (currentStep) {
      case 0: {
        const errors = validatePersonalData(formData.personalData);
        setPersonalErrors(errors);
        if (Object.keys(errors).length > 0) return;
        break;
      }
      case 1: {
        const errors = validateParticipation(formData.participation);
        setParticipationErrors(errors);
        if (Object.keys(errors).length > 0) return;
        break;
      }
    }

    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  }

  function handleBack() {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
      setSubmitError(null);
    }
  }

  function handleGoToStep(step: number) {
    setCurrentStep(step);
    setSubmitError(null);
  }

  function handleStepClick(step: number) {
    // Only allow clicking on completed steps
    if (step < currentStep) {
      setCurrentStep(step);
      setSubmitError(null);
    }
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Build the request body
      const body: Record<string, unknown> = {
        personalData: {
          salutation: formData.personalData.salutation || null,
          firstName: formData.personalData.firstName,
          lastName: formData.personalData.lastName,
          email: formData.personalData.email,
          phone: formData.personalData.phone || null,
          street: formData.personalData.street || null,
          houseNumber: formData.personalData.houseNumber || null,
          postalCode: formData.personalData.postalCode || null,
          city: formData.personalData.city || null,
          taxId: formData.personalData.taxId || null,
        },
        participation: {
          fundId: formData.participation.fundId,
          capitalContribution: parseFloat(formData.participation.capitalContribution),
          entryDate: formData.participation.entryDate,
          shareholderNumber: formData.participation.shareholderNumber || null,
        },
        portalAccess: {
          createPortalAccess: formData.portalAccess.createPortalAccess,
          sendWelcomeEmail: formData.portalAccess.sendWelcomeEmail,
        },
      };

      const response = await fetch("/api/shareholders/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Anlegen des Gesellschafters");
      }

      const result: OnboardingResult = await response.json();

      // Upload documents if any
      if (formData.documents.files.length > 0) {
        let uploadedCount = 0;
        for (const doc of formData.documents.files) {
          try {
            const docFormData = new FormData();
            docFormData.append("file", doc.file);
            docFormData.append("title", doc.label);
            docFormData.append("category", doc.category);
            docFormData.append("shareholderId", result.shareholderId);

            const docResponse = await fetch("/api/documents", {
              method: "POST",
              body: docFormData,
            });

            if (docResponse.ok) {
              uploadedCount++;
            }
          } catch {
            // Individual document upload failure - continue with others
          }
        }
        result.documentsUploaded = uploadedCount;
      }

      setOnboardingResult(result);
      setShowResultDialog(true);
      toast.success("Gesellschafter wurde erfolgreich angelegt");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ein unbekannter Fehler ist aufgetreten";
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyPassword() {
    if (!onboardingResult?.temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(onboardingResult.temporaryPassword);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
      toast.success("Passwort in die Zwischenablage kopiert");
    } catch {
      toast.error("Kopieren fehlgeschlagen");
    }
  }

  function handleResultDialogClose() {
    setShowResultDialog(false);
    router.push(`/funds/${formData.participation.fundId}`);
  }

  const isLastStep = currentStep === WIZARD_STEPS.length - 1;

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <Stepper
        steps={[...WIZARD_STEPS]}
        currentStep={currentStep}
        onStepClick={handleStepClick}
      />

      {/* Step Content */}
      <StepContent>
        {currentStep === 0 && (
          <StepPersonalData
            data={formData.personalData}
            onChange={(personalData) => {
              setFormData((prev) => ({ ...prev, personalData }));
              setPersonalErrors({});
            }}
            errors={personalErrors}
          />
        )}

        {currentStep === 1 && (
          <StepParticipation
            data={formData.participation}
            onChange={(participation) => {
              setFormData((prev) => ({ ...prev, participation }));
              setParticipationErrors({});
            }}
            errors={participationErrors}
          />
        )}

        {currentStep === 2 && (
          <StepPortalAccess
            data={formData.portalAccess}
            personalData={formData.personalData}
            onChange={(portalAccess) =>
              setFormData((prev) => ({ ...prev, portalAccess }))
            }
          />
        )}

        {currentStep === 3 && (
          <StepDocuments
            data={formData.documents}
            onChange={(documents) =>
              setFormData((prev) => ({ ...prev, documents }))
            }
          />
        )}

        {currentStep === 4 && (
          <StepReview data={formData} onGoToStep={handleGoToStep} />
        )}
      </StepContent>

      {/* Error display */}
      {submitError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      {/* Step Actions */}
      <StepActions>
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 0 || isSubmitting}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Zurueck
        </Button>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground hidden sm:inline">
            Schritt {currentStep + 1} von {WIZARD_STEPS.length}
          </span>
        </div>

        {isLastStep ? (
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            {isSubmitting ? "Wird angelegt..." : "Gesellschafter anlegen"}
          </Button>
        ) : (
          <Button onClick={handleNext} disabled={!canGoNext()}>
            Weiter
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </StepActions>

      {/* Success Dialog with optional password display */}
      <Dialog open={showResultDialog} onOpenChange={handleResultDialogClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Gesellschafter angelegt
            </DialogTitle>
            <DialogDescription>
              Der Gesellschafter wurde erfolgreich erstellt.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Summary */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Person</span>
                <span className="font-medium">
                  {formData.personalData.firstName} {formData.personalData.lastName}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Gesellschaft</span>
                <span className="font-medium">{formData.participation.fundName}</span>
              </div>
              {onboardingResult?.portalAccessCreated && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Portal-Zugang</span>
                  <span className="font-medium text-green-600">Erstellt</span>
                </div>
              )}
              {onboardingResult && onboardingResult.documentsUploaded > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Dokumente</span>
                  <span className="font-medium">
                    {onboardingResult.documentsUploaded} hochgeladen
                  </span>
                </div>
              )}
            </div>

            {/* Temporary Password */}
            {onboardingResult?.temporaryPassword && (
              <>
                {/* Email sent success banner */}
                {onboardingResult.emailSent && (
                  <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Die Zugangsdaten wurden erfolgreich per E-Mail an den
                      Gesellschafter versendet.
                    </span>
                  </div>
                )}

                {/* Email send failed warning */}
                {onboardingResult.emailSent === false && (
                  <div className="flex items-start gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Die Zugangsdaten konnten nicht per E-Mail versendet werden.
                      Bitte teilen Sie die Daten manuell mit.
                    </span>
                  </div>
                )}

                <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Temporaeres Passwort</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-md border bg-background px-3 py-2 font-mono text-sm">
                      {onboardingResult.temporaryPassword}
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={copyPassword}
                      aria-label="Passwort kopieren"
                    >
                      {copiedPassword ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {!onboardingResult.emailSent && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Bitte teilen Sie das temporaere Passwort dem Gesellschafter mit.
                      Es kann nur jetzt angezeigt werden.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button onClick={handleResultDialogClose} className="w-full sm:w-auto">
              Zur Gesellschaft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
