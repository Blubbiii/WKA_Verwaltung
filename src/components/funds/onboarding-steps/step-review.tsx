"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  User,
  Building2,
  Shield,
  FileText,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Wallet,
  Hash,
  Pencil,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { OnboardingFormData } from "../onboarding-types";

interface StepReviewProps {
  data: OnboardingFormData;
  onGoToStep: (step: number) => void;
}

function ReviewSection({
  title,
  icon: Icon,
  stepIndex,
  onEdit,
  children,
}: {
  title: string;
  icon: React.ElementType;
  stepIndex: number;
  onEdit: (step: number) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h4 className="font-medium">{title}</h4>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onEdit(stepIndex)}
          className="h-8 gap-1 text-muted-foreground hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
          Bearbeiten
        </Button>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right font-medium">{value || "-"}</span>
    </div>
  );
}

export function StepReview({ data, onGoToStep }: StepReviewProps) {
  const { personalData, participation, portalAccess, documents } = data;

  const fullName = [personalData.firstName, personalData.lastName].filter(Boolean).join(" ");
  const address = [
    [personalData.street, personalData.houseNumber].filter(Boolean).join(" "),
    [personalData.postalCode, personalData.city].filter(Boolean).join(" ")
  ].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Zusammenfassung</h3>
        <p className="text-sm text-muted-foreground">
          Prüfen Sie alle Angaben bevor Sie den Gesellschafter anlegen.
        </p>
      </div>

      {/* Personal Data */}
      <ReviewSection title="Stammdaten" icon={User} stepIndex={0} onEdit={onGoToStep}>
        {personalData.salutation && (
          <ReviewRow label="Anrede" value={personalData.salutation} />
        )}
        <ReviewRow label="Name" value={fullName} />
        {personalData.birthDate && (
          <ReviewRow
            label="Geburtsdatum"
            value={new Date(personalData.birthDate).toLocaleDateString("de-DE")}
          />
        )}
        {address && (
          <ReviewRow
            label="Adresse"
            value={
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-muted-foreground" />
                {address}
              </span>
            }
          />
        )}
        {personalData.phone && (
          <ReviewRow
            label="Telefon"
            value={
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3 text-muted-foreground" />
                {personalData.phone}
              </span>
            }
          />
        )}
        <ReviewRow
          label="E-Mail"
          value={
            personalData.email ? (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3 text-muted-foreground" />
                {personalData.email}
              </span>
            ) : (
              "-"
            )
          }
        />
        {personalData.taxId && (
          <ReviewRow label="Steuer-ID" value={personalData.taxId} />
        )}
      </ReviewSection>

      {/* Participation */}
      <ReviewSection title="Beteiligung" icon={Building2} stepIndex={1} onEdit={onGoToStep}>
        <ReviewRow
          label="Gesellschaft"
          value={
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3 text-muted-foreground" />
              {participation.fundName || "-"}
            </span>
          }
        />
        <ReviewRow
          label="Kapitalanteil"
          value={
            participation.capitalContribution ? (
              <span className="flex items-center gap-1">
                <Wallet className="h-3 w-3 text-muted-foreground" />
                {formatCurrency(parseFloat(participation.capitalContribution))}
              </span>
            ) : (
              "-"
            )
          }
        />
        <ReviewRow
          label="Beitrittsdatum"
          value={
            participation.entryDate ? (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                {new Date(participation.entryDate).toLocaleDateString("de-DE")}
              </span>
            ) : (
              "-"
            )
          }
        />
        {participation.shareholderNumber && (
          <ReviewRow
            label="Gesellschafter-Nr."
            value={
              <span className="flex items-center gap-1">
                <Hash className="h-3 w-3 text-muted-foreground" />
                {participation.shareholderNumber}
              </span>
            }
          />
        )}
      </ReviewSection>

      {/* Portal Access */}
      <ReviewSection title="Portal-Zugang" icon={Shield} stepIndex={2} onEdit={onGoToStep}>
        <ReviewRow
          label="Portal-Zugang"
          value={
            portalAccess.createPortalAccess ? (
              <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                Wird erstellt
              </Badge>
            ) : (
              <Badge variant="secondary">Kein Zugang</Badge>
            )
          }
        />
        {portalAccess.createPortalAccess && (
          <>
            <ReviewRow label="Benutzername" value={portalAccess.username || personalData.email} />
            <ReviewRow
              label="Willkommens-E-Mail"
              value={portalAccess.sendWelcomeEmail ? "Ja" : "Nein"}
            />
          </>
        )}
      </ReviewSection>

      {/* Documents */}
      <ReviewSection title="Dokumente" icon={FileText} stepIndex={3} onEdit={onGoToStep}>
        {documents.files.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Dokumente hochgeladen</p>
        ) : (
          documents.files.map((doc, index) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <FileText className="h-3 w-3 text-muted-foreground" />
              <span className="font-medium">{doc.label}:</span>
              <span className="text-muted-foreground truncate">{doc.file.name}</span>
            </div>
          ))
        )}
      </ReviewSection>

      <Separator />

      {/* Final summary */}
      <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
        <h4 className="font-medium mb-2">Was passiert beim Anlegen?</h4>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>1. Person wird in der Datenbank angelegt</li>
          <li>2. Gesellschafterbeteiligung wird erstellt und Anteile werden berechnet</li>
          {portalAccess.createPortalAccess && (
            <li>3. Portal-Benutzerkonto wird mit temporaerem Passwort erstellt</li>
          )}
          {documents.files.length > 0 && (
            <li>
              {portalAccess.createPortalAccess ? "4" : "3"}. {documents.files.length} Dokument
              {documents.files.length > 1 ? "e werden" : " wird"} hochgeladen
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
