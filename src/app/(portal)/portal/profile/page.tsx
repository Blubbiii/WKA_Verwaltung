"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Building,
  CreditCard,
  Shield,
  Pencil,
  X,
  Save,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

// Profile data interface
interface Profile {
  id: string;
  // Personal data
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  // Address
  street: string | null;
  houseNumber: string | null;
  zipCode: string | null;
  city: string | null;
  country: string | null;
  // Bank data
  bankName: string | null;
  iban: string | null;
  bic: string | null;
  // Tax
  taxId: string | null;
}

// Form validation schema
const profileFormSchema = z.object({
  email: z.string().email("Bitte geben Sie eine gueltige E-Mail-Adresse ein"),
  phone: z.string().optional().nullable(),
  street: z.string().optional().nullable(),
  houseNumber: z.string().optional().nullable(),
  zipCode: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  iban: z
    .string()
    .optional()
    .nullable()
    .refine(
      (val) => !val || /^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$/.test(val.replace(/\s/g, "")),
      "Bitte geben Sie eine gueltige IBAN ein"
    ),
  bic: z
    .string()
    .optional()
    .nullable()
    .refine(
      (val) => !val || /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(val),
      "Bitte geben Sie einen gueltigen BIC ein"
    ),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      email: "",
      phone: "",
      street: "",
      houseNumber: "",
      zipCode: "",
      city: "",
      country: "",
      bankName: "",
      iban: "",
      bic: "",
    },
  });

  useEffect(() => {
    async function fetchProfile() {
      try {
        const response = await fetch("/api/portal/my-profile");
        if (!response.ok) {
          throw new Error("Profil konnte nicht geladen werden");
        }
        const data = await response.json();
        setProfile(data);
        // Reset form with fetched data
        form.reset({
          email: data.email || "",
          phone: data.phone || "",
          street: data.street || "",
          houseNumber: data.houseNumber || "",
          zipCode: data.zipCode || "",
          city: data.city || "",
          country: data.country || "",
          bankName: data.bankName || "",
          iban: data.iban || "",
          bic: data.bic || "",
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ein Fehler ist aufgetreten");
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [form]);

  async function onSubmit(values: ProfileFormValues) {
    setIsSaving(true);
    setSaveSuccess(false);
    setError(null);

    try {
      const response = await fetch("/api/portal/my-profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Speichern fehlgeschlagen");
      }

      const updatedProfile = await response.json();
      setProfile(updatedProfile);
      setIsEditing(false);
      setSaveSuccess(true);
      // Clear success message after 3 seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen");
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    setIsEditing(false);
    setError(null);
    // Reset form to original profile data
    if (profile) {
      form.reset({
        email: profile.email || "",
        phone: profile.phone || "",
        street: profile.street || "",
        houseNumber: profile.houseNumber || "",
        zipCode: profile.zipCode || "",
        city: profile.city || "",
        country: profile.country || "",
        bankName: profile.bankName || "",
        iban: profile.iban || "",
        bic: profile.bic || "",
      });
    }
  }

  function formatIBAN(iban: string | null): string {
    if (!iban) return "-";
    // Format IBAN in groups of 4
    return iban.replace(/(.{4})/g, "$1 ").trim();
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mein Profil</h1>
          <p className="text-muted-foreground">
            Verwalten Sie Ihre persoenlichen Daten
          </p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mein Profil</h1>
          <p className="text-muted-foreground">
            Verwalten Sie Ihre persoenlichen Daten und Bankverbindung
          </p>
        </div>
        {!isEditing && (
          <Button onClick={() => setIsEditing(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            Bearbeiten
          </Button>
        )}
      </div>

      {/* Success Message */}
      {saveSuccess && (
        <Alert className="border-green-200 bg-green-50 text-green-800">
          <AlertDescription>
            Ihre Aenderungen wurden erfolgreich gespeichert.
          </AlertDescription>
        </Alert>
      )}

      {/* Error Message */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Personal Data Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Persoenliche Daten
                </CardTitle>
                <CardDescription>
                  Ihre Kontaktdaten und Anschrift
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Name (Read-Only) */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Name
                  </label>
                  <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {profile?.firstName} {profile?.lastName}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Nur durch Administrator aenderbar
                  </p>
                </div>

                {/* Email */}
                {isEditing ? (
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E-Mail</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input className="pl-10" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">
                      E-Mail
                    </label>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>{profile?.email || "-"}</span>
                    </div>
                  </div>
                )}

                {/* Phone */}
                {isEditing ? (
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefon</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              className="pl-10"
                              placeholder="+49 123 456789"
                              {...field}
                              value={field.value || ""}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">
                      Telefon
                    </label>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{profile?.phone || "-"}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Address Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Adresse
                </CardTitle>
                <CardDescription>Ihre Postanschrift</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="street"
                        render={({ field }) => (
                          <FormItem className="col-span-2">
                            <FormLabel>Strasse</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Musterstrasse"
                                {...field}
                                value={field.value || ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="houseNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nr.</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="1a"
                                {...field}
                                value={field.value || ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="zipCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>PLZ</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="12345"
                                {...field}
                                value={field.value || ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem className="col-span-2">
                            <FormLabel>Stadt</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Musterstadt"
                                {...field}
                                value={field.value || ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Land</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Deutschland"
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        {profile?.street || profile?.city ? (
                          <>
                            <p>
                              {profile?.street} {profile?.houseNumber}
                            </p>
                            <p>
                              {profile?.zipCode} {profile?.city}
                            </p>
                            {profile?.country && <p>{profile.country}</p>}
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            Keine Adresse hinterlegt
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Bank Data Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Bankverbindung
              </CardTitle>
              <CardDescription>
                Ihre Bankdaten fuer Ausschuettungen
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="bankName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bank</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Building className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              className="pl-10"
                              placeholder="Musterbank"
                              {...field}
                              value={field.value || ""}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="iban"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>IBAN</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="DE89 3704 0044 0532 0130 00"
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => {
                              // Convert to uppercase and remove spaces for validation
                              field.onChange(e.target.value.toUpperCase());
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="bic"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>BIC</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="COBADEFFXXX"
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => {
                              field.onChange(e.target.value.toUpperCase());
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">
                      Bank
                    </label>
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-muted-foreground" />
                      <span>{profile?.bankName || "-"}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">
                      IBAN
                    </label>
                    <p className="font-mono">{formatIBAN(profile?.iban || null)}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">
                      BIC
                    </label>
                    <p className="font-mono">{profile?.bic || "-"}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tax ID Card (Read-Only) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Steuerliche Angaben
              </CardTitle>
              <CardDescription>
                Ihre steuerlichen Identifikationsnummern
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Steuer-ID
                </label>
                <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono">{profile?.taxId || "-"}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Nur durch Administrator aenderbar
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          {isEditing && (
            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isSaving}
              >
                <X className="mr-2 h-4 w-4" />
                Abbrechen
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Speichern...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Speichern
                  </>
                )}
              </Button>
            </div>
          )}
        </form>
      </Form>
    </div>
  );
}
