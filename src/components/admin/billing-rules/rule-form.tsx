"use client";

/**
 * RuleForm Component
 * Formular für Erstellung/Bearbeitung von Billing Rules
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Calendar,
  DollarSign,
  Percent,
  Building,
  Users,
  FileText,
  Save,
  Loader2,
  Info,
  Euro,
} from "lucide-react";

// Types
type RuleType = "LEASE_PAYMENT" | "DISTRIBUTION" | "MANAGEMENT_FEE" | "CUSTOM";
type Frequency = "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL" | "CUSTOM_CRON";

interface Fund {
  id: string;
  name: string;
}

interface Park {
  id: string;
  name: string;
}

// Validation Schema
const formSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich").max(200),
  description: z.string().max(1000).optional(),
  ruleType: z.enum(["LEASE_PAYMENT", "DISTRIBUTION", "MANAGEMENT_FEE", "CUSTOM"]),
  frequency: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "CUSTOM_CRON"]),
  cronPattern: z.string().optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  isActive: z.boolean(),
  parameters: z.record(z.unknown()),
});

type FormData = z.infer<typeof formSchema>;

// Labels
const RULE_TYPE_LABELS: Record<RuleType, string> = {
  LEASE_PAYMENT: "Pachtzahlung",
  DISTRIBUTION: "Ausschuettung",
  MANAGEMENT_FEE: "Verwaltungsgebühr",
  CUSTOM: "Benutzerdefiniert",
};

const RULE_TYPE_DESCRIPTIONS: Record<RuleType, string> = {
  LEASE_PAYMENT: "Automatische Pachtzahlungen an Verpächter basierend auf Pachtverträgen",
  DISTRIBUTION: "Ausschuettungen an Gesellschafter basierend auf Beteiligungsanteilen",
  MANAGEMENT_FEE: "Verwaltungsgebühren (fix oder prozentual)",
  CUSTOM: "Benutzerdefinierte Rechnungen mit frei definierbaren Positionen",
};

const FREQUENCY_LABELS: Record<Frequency, string> = {
  MONTHLY: "Monatlich",
  QUARTERLY: "Vierteljährlich",
  SEMI_ANNUAL: "Halbjährlich",
  ANNUAL: "Jährlich",
  CUSTOM_CRON: "Benutzerdefiniert (Cron)",
};

interface RuleFormProps {
  initialData?: {
    id: string;
    name: string;
    description: string | null;
    ruleType: RuleType;
    frequency: Frequency;
    cronPattern: string | null;
    dayOfMonth: number | null;
    parameters: Record<string, unknown>;
    isActive: boolean;
  };
  funds: Fund[];
  parks: Park[];
  onSuccess?: () => void;
}

export function RuleForm({ initialData, funds, parks, onSuccess }: RuleFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!initialData?.id;

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name || "",
      description: initialData?.description || "",
      ruleType: initialData?.ruleType || "LEASE_PAYMENT",
      frequency: initialData?.frequency || "MONTHLY",
      cronPattern: initialData?.cronPattern || "",
      dayOfMonth: initialData?.dayOfMonth || 1,
      isActive: initialData?.isActive ?? true,
      parameters: initialData?.parameters || {},
    },
  });

  const ruleType = watch("ruleType");
  const frequency = watch("frequency");
  const parameters = watch("parameters");

  // Parameter Helpers
  const setParameter = (key: string, value: unknown) => {
    setValue("parameters", { ...parameters, [key]: value });
  };

  const getParameter = <T,>(key: string, defaultValue: T): T => {
    return (parameters[key] as T) ?? defaultValue;
  };

  // Form Submit
  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);

    try {
      const url = isEditing
        ? `/api/admin/billing-rules/${initialData.id}`
        : "/api/admin/billing-rules";

      const method = isEditing ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }

      const result = await response.json();

      toast.success(
        isEditing
          ? "Abrechnungsregel aktualisiert"
          : "Abrechnungsregel erstellt"
      );

      if (onSuccess) {
        onSuccess();
      } else {
        router.push(`/admin/billing-rules/${result.id}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Speichern");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Basis-Informationen */}
      <Card>
        <CardHeader>
          <CardTitle>Grundeinstellungen</CardTitle>
          <CardDescription>Name und Beschreibung der Abrechnungsregel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="z.B. Monatliche Pachtzahlungen WP Nord"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="ruleType">Regeltyp *</Label>
              <Controller
                name="ruleType"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={isEditing}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Regeltyp waehlen" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(RULE_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {isEditing && (
                <p className="text-xs text-muted-foreground">
                  Regeltyp kann nach Erstellung nicht geändert werden
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Beschreibung</Label>
            <Textarea
              id="description"
              placeholder="Optionale Beschreibung..."
              {...register("description")}
            />
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>{RULE_TYPE_DESCRIPTIONS[ruleType]}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Zeitplanung */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Zeitplanung
          </CardTitle>
          <CardDescription>Wann soll die Regel ausgeführt werden?</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="frequency">Frequenz *</Label>
              <Controller
                name="frequency"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Frequenz waehlen" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {frequency !== "CUSTOM_CRON" && (
              <div className="space-y-2">
                <Label htmlFor="dayOfMonth">Tag im Monat (1-28)</Label>
                <Input
                  id="dayOfMonth"
                  type="number"
                  min={1}
                  max={28}
                  {...register("dayOfMonth", { valueAsNumber: true })}
                />
                <p className="text-xs text-muted-foreground">
                  Ausführung am {watch("dayOfMonth") || 1}. des Monats
                </p>
              </div>
            )}

            {frequency === "CUSTOM_CRON" && (
              <div className="space-y-2">
                <Label htmlFor="cronPattern">Cron-Expression *</Label>
                <Input
                  id="cronPattern"
                  placeholder="0 0 1 * *"
                  {...register("cronPattern")}
                />
                <p className="text-xs text-muted-foreground">
                  Format: Minute Stunde Tag Monat Wochentag
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <Controller
              name="isActive"
              control={control}
              render={({ field }) => (
                <Switch
                  id="isActive"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label htmlFor="isActive">Regel ist aktiv</Label>
          </div>
        </CardContent>
      </Card>

      {/* Parameter - je nach Regeltyp */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Parameter
          </CardTitle>
          <CardDescription>
            Spezifische Einstellungen für {RULE_TYPE_LABELS[ruleType]}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* LEASE_PAYMENT Parameter */}
          {ruleType === "LEASE_PAYMENT" && (
            <>
              <div className="space-y-2">
                <Label>Park (optional)</Label>
                <Select
                  value={getParameter("parkId", "") || "_all"}
                  onValueChange={(v) => setParameter("parkId", v === "_all" ? undefined : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Alle Parks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Alle Parks</SelectItem>
                    {parks.map((park) => (
                      <SelectItem key={park.id} value={park.id}>
                        {park.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Optional: Nur Pachtverträge eines bestimmten Parks
                </p>
              </div>

              <div className="space-y-2">
                <Label>Steuerart</Label>
                <Select
                  value={getParameter("taxType", "EXEMPT")}
                  onValueChange={(v) => setParameter("taxType", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EXEMPT">Steuerfrei (0%)</SelectItem>
                    <SelectItem value="STANDARD">Standard (19%)</SelectItem>
                    <SelectItem value="REDUCED">Ermaessigt (7%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="useMinimumRent"
                  checked={getParameter("useMinimumRent", true)}
                  onCheckedChange={(v) => setParameter("useMinimumRent", v)}
                />
                <Label htmlFor="useMinimumRent">Mindestpacht verwenden</Label>
              </div>
            </>
          )}

          {/* DISTRIBUTION Parameter */}
          {ruleType === "DISTRIBUTION" && (
            <>
              <div className="space-y-2">
                <Label>Gesellschaft *</Label>
                <Select
                  value={getParameter("fundId", "")}
                  onValueChange={(v) => setParameter("fundId", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Gesellschaft waehlen" />
                  </SelectTrigger>
                  <SelectContent>
                    {funds.map((fund) => (
                      <SelectItem key={fund.id} value={fund.id}>
                        {fund.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Gesamtbetrag (EUR) *</Label>
                <div className="relative">
                  <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="pl-10"
                    value={getParameter("totalAmount", 0)}
                    onChange={(e) =>
                      setParameter("totalAmount", parseFloat(e.target.value) || 0)
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Beschreibung</Label>
                <Input
                  placeholder="z.B. Jahresausschuettung 2024"
                  value={getParameter("description", "")}
                  onChange={(e) => setParameter("description", e.target.value)}
                />
              </div>
            </>
          )}

          {/* MANAGEMENT_FEE Parameter */}
          {ruleType === "MANAGEMENT_FEE" && (
            <>
              <div className="space-y-2">
                <Label>Berechnungsart *</Label>
                <Select
                  value={getParameter("calculationType", "FIXED")}
                  onValueChange={(v) => setParameter("calculationType", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FIXED">Fester Betrag</SelectItem>
                    <SelectItem value="PERCENTAGE">Prozentsatz</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {getParameter("calculationType", "FIXED") === "FIXED" && (
                <div className="space-y-2">
                  <Label>Betrag (EUR) *</Label>
                  <div className="relative">
                    <Euro className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="pl-10"
                      value={getParameter("amount", 0)}
                      onChange={(e) =>
                        setParameter("amount", parseFloat(e.target.value) || 0)
                      }
                    />
                  </div>
                </div>
              )}

              {getParameter<string>("calculationType", "FIXED") === "PERCENTAGE" && (
                <>
                  <div className="space-y-2">
                    <Label>Prozentsatz *</Label>
                    <div className="relative">
                      <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        className="pl-10"
                        value={getParameter("percentage", 0)}
                        onChange={(e) =>
                          setParameter("percentage", parseFloat(e.target.value) || 0)
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Basiswert *</Label>
                    <Select
                      value={getParameter("baseValue", "TOTAL_CAPITAL")}
                      onValueChange={(v) => setParameter("baseValue", v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TOTAL_CAPITAL">Gesamtkapital</SelectItem>
                        <SelectItem value="ANNUAL_REVENUE">Jahresumsatz</SelectItem>
                        <SelectItem value="NET_ASSET_VALUE">Nettoinventarwert</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <Separator />

              <div className="space-y-2">
                <Label>Gesellschaft (optional)</Label>
                <Select
                  value={getParameter("fundId", "") || "_all"}
                  onValueChange={(v) => setParameter("fundId", v === "_all" ? undefined : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Alle Gesellschaften" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">Alle Gesellschaften</SelectItem>
                    {funds.map((fund) => (
                      <SelectItem key={fund.id} value={fund.id}>
                        {fund.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Empfänger</Label>
                <Input
                  placeholder="z.B. WindparkManager Verwaltungs GmbH"
                  value={getParameter("recipientName", "")}
                  onChange={(e) => setParameter("recipientName", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Empfänger-Adresse</Label>
                <Textarea
                  placeholder="Strasse, PLZ Ort"
                  value={getParameter("recipientAddress", "")}
                  onChange={(e) => setParameter("recipientAddress", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Steuerart</Label>
                <Select
                  value={getParameter("taxType", "STANDARD")}
                  onValueChange={(v) => setParameter("taxType", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STANDARD">Standard (19%)</SelectItem>
                    <SelectItem value="REDUCED">Ermaessigt (7%)</SelectItem>
                    <SelectItem value="EXEMPT">Steuerfrei (0%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* CUSTOM Parameter */}
          {ruleType === "CUSTOM" && (
            <>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Benutzerdefinierte Regeln erfordern manuelle Konfiguration der Rechnungspositionen.
                  Für komplexe Anwendungsfaelle kontaktieren Sie bitte den Support.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label>Rechnungstyp *</Label>
                <Select
                  value={getParameter("invoiceType", "INVOICE")}
                  onValueChange={(v) => setParameter("invoiceType", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INVOICE">Rechnung</SelectItem>
                    <SelectItem value="CREDIT_NOTE">Gutschrift</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Empfänger</Label>
                <Input
                  placeholder="Name des Empfängers"
                  value={getParameter("recipientName", "")}
                  onChange={(e) => setParameter("recipientName", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Empfänger-Adresse</Label>
                <Textarea
                  placeholder="Strasse, PLZ Ort"
                  value={getParameter("recipientAddress", "")}
                  onChange={(e) => setParameter("recipientAddress", e.target.value)}
                />
              </div>

              {/* Einfache Items-Konfiguration */}
              <div className="space-y-2">
                <Label>Positionen (JSON)</Label>
                <Textarea
                  placeholder='[{"description": "Position 1", "quantity": 1, "unitPrice": 100}]'
                  className="font-mono text-sm"
                  rows={5}
                  value={JSON.stringify(getParameter("items", []), null, 2)}
                  onChange={(e) => {
                    try {
                      const items = JSON.parse(e.target.value);
                      setParameter("items", items);
                    } catch {
                      // Ignore parse errors while typing
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  JSON-Array mit Positionen. Jede Position benötigt: description, quantity, unitPrice
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Submit Buttons */}
      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          Abbrechen
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Save className="mr-2 h-4 w-4" />
          {isEditing ? "Speichern" : "Erstellen"}
        </Button>
      </div>
    </form>
  );
}

export default RuleForm;
