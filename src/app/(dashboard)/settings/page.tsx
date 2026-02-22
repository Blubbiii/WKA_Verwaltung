"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  User,
  Bell,
  Palette,
  Lock,
  Loader2,
  Check,
  Moon,
  Sun,
  Monitor,
  AlertCircle,
  Upload,
  Trash2,
  Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NotificationPreferences } from "@/components/settings/notification-preferences";
import { TenantFeaturesSettings } from "@/components/settings/TenantFeaturesSettings";
import { usePermissions } from "@/hooks/usePermissions";
import { ToggleLeft } from "lucide-react";
import { toast } from "sonner";

// =============================================================================
// Types
// =============================================================================

interface UserSettings {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  role: string;
  avatarUrl: string | null;
  preferences: {
    theme: string;
    language: string;
    notifications: Record<string, boolean>;
    defaultPageSize: number;
    defaultStartPage: string;
  };
  lastLoginAt: string | null;
  createdAt: string;
}

// =============================================================================
// Schemas
// =============================================================================

const profileFormSchema = z.object({
  firstName: z.string().min(1, "Vorname ist erforderlich"),
  lastName: z.string().min(1, "Nachname ist erforderlich"),
  email: z.string().email("Ungueltige E-Mail-Adresse"),
  phone: z.string().optional(),
});

const passwordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "Aktuelles Passwort ist erforderlich"),
    newPassword: z
      .string()
      .min(8, "Neues Passwort muss mindestens 8 Zeichen lang sein"),
    confirmPassword: z
      .string()
      .min(1, "Passwort-Bestaetigung ist erforderlich"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwoerter stimmen nicht ueberein",
    path: ["confirmPassword"],
  });

type ProfileFormValues = z.infer<typeof profileFormSchema>;
type PasswordFormValues = z.infer<typeof passwordFormSchema>;

// =============================================================================
// Avatar Upload Component
// =============================================================================

function AvatarUploadSection({
  settings,
  onSettingsUpdated,
}: {
  settings: UserSettings | null;
  onSettingsUpdated: () => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update preview URL when settings change
  useEffect(() => {
    if (settings?.avatarUrl) {
      setPreviewUrl(settings.avatarUrl);
    } else {
      setPreviewUrl(null);
    }
  }, [settings?.avatarUrl]);

  function getInitials(): string {
    const first = settings?.firstName?.[0] || "";
    const last = settings?.lastName?.[0] || "";
    if (first && last) return `${first}${last}`.toUpperCase();
    if (settings?.email) return settings.email.slice(0, 2).toUpperCase();
    return "??";
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Client-side validation
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Ungueltiges Dateiformat. Erlaubt: PNG, JPEG, WebP");
      return;
    }

    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      toast.error("Datei zu gross. Maximale Groesse: 2MB");
      return;
    }

    try {
      setIsUploading(true);

      // Show local preview immediately
      const localPreview = URL.createObjectURL(file);
      setPreviewUrl(localPreview);

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/user/avatar", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Fehler beim Hochladen");
      }

      const data = await response.json();
      setPreviewUrl(data.signedUrl);
      toast.success("Profilbild wurde hochgeladen");
      onSettingsUpdated();
    } catch (error) {
      // Revert preview on error
      setPreviewUrl(settings?.avatarUrl || null);
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Hochladen des Profilbilds"
      );
    } finally {
      setIsUploading(false);
      // Reset file input
      event.target.value = "";
    }
  }

  async function handleDelete() {
    try {
      setIsDeleting(true);

      const response = await fetch("/api/user/avatar", {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Fehler beim Entfernen");
      }

      setPreviewUrl(null);
      toast.success("Profilbild wurde entfernt");
      onSettingsUpdated();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Entfernen des Profilbilds"
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profilbild</CardTitle>
        <CardDescription>
          Laden Sie ein Profilbild hoch (max. 2MB, PNG/JPEG/WebP)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-6">
          {/* Avatar Preview */}
          <div
            className="relative group cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <Avatar className="h-24 w-24">
              {previewUrl ? (
                <AvatarImage src={previewUrl} alt="Profilbild" />
              ) : null}
              <AvatarFallback className="text-2xl bg-primary/10 text-primary">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            {/* Upload Overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="h-6 w-6 text-white" />
            </div>
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploading || isDeleting}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {isUploading ? "Wird hochgeladen..." : "Bild hochladen"}
              </Button>
              {previewUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUploading || isDeleting}
                  onClick={handleDelete}
                >
                  {isDeleting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Entfernen
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              PNG, JPEG oder WebP. Max. 2MB.
            </p>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            onChange={handleFileChange}
            disabled={isUploading || isDeleting}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Profile Tab Component
// =============================================================================

function ProfileTab({
  settings,
  onSettingsUpdated,
}: {
  settings: UserSettings | null;
  onSettingsUpdated: () => void;
}) {
  const [isSaving, setIsSaving] = useState(false);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
    },
  });

  // Update form when settings load
  useEffect(() => {
    if (settings) {
      profileForm.reset({
        firstName: settings.firstName || "",
        lastName: settings.lastName || "",
        email: settings.email || "",
        phone: settings.phone || "",
      });
    }
  }, [settings, profileForm]);

  async function onProfileSubmit(data: ProfileFormValues) {
    try {
      setIsSaving(true);

      const response = await fetch("/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone || "",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Fehler beim Speichern");
      }

      toast.success("Profil wurde erfolgreich gespeichert");
      onSettingsUpdated();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Speichern des Profils"
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!settings) {
    return <ProfileSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Avatar Upload */}
      <AvatarUploadSection
        settings={settings}
        onSettingsUpdated={onSettingsUpdated}
      />

      {/* Profile Form */}
      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
          <CardDescription>
            Verwalten Sie Ihre persoenlichen Daten
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...profileForm}>
            <form
              onSubmit={profileForm.handleSubmit(onProfileSubmit)}
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={profileForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vorname</FormLabel>
                      <FormControl>
                        <Input placeholder="Max" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nachname</FormLabel>
                      <FormControl>
                        <Input placeholder="Mustermann" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={profileForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-Mail</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="max@beispiel.de"
                        disabled
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Die E-Mail-Adresse kann nicht geaendert werden.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={profileForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefon</FormLabel>
                    <FormControl>
                      <Input placeholder="+49 123 456789" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center gap-3 pt-2">
                <div className="flex-1">
                  <span className="text-sm text-muted-foreground">
                    Rolle: <Badge variant="secondary">{settings.role}</Badge>
                  </span>
                </div>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  Speichern
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Appearance Tab Component
// =============================================================================

function AppearanceTab({
  settings,
  onSettingsUpdated,
}: {
  settings: UserSettings | null;
  onSettingsUpdated: () => void;
}) {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [isSavingTheme, setIsSavingTheme] = useState(false);
  const [pageSize, setPageSize] = useState("25");
  const [startPage, setStartPage] = useState("/dashboard");
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  // Load from settings
  useEffect(() => {
    if (settings) {
      const savedTheme = settings.preferences.theme as
        | "light"
        | "dark"
        | "system";
      if (["light", "dark", "system"].includes(savedTheme)) {
        setTheme(savedTheme);
      }
      setPageSize(String(settings.preferences.defaultPageSize || 25));
      setStartPage(settings.preferences.defaultStartPage || "/dashboard");
    } else {
      // Fallback to localStorage for theme
      const localTheme = localStorage.getItem("theme") as
        | "light"
        | "dark"
        | "system"
        | null;
      if (localTheme && ["light", "dark", "system"].includes(localTheme)) {
        setTheme(localTheme);
      }
    }
  }, [settings]);

  function applyTheme(newTheme: "light" | "dark" | "system") {
    // Apply theme to DOM immediately
    const root = document.documentElement;
    if (newTheme === "system") {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      root.classList.toggle("dark", prefersDark);
    } else {
      root.classList.toggle("dark", newTheme === "dark");
    }
    // Save to localStorage for immediate persistence
    localStorage.setItem("theme", newTheme);
  }

  async function handleThemeChange(newTheme: "light" | "dark" | "system") {
    setTheme(newTheme);
    applyTheme(newTheme);

    // Also save to API for cross-browser persistence
    try {
      setIsSavingTheme(true);
      const response = await fetch("/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: { theme: newTheme },
        }),
      });

      if (!response.ok) {
      } else {
        onSettingsUpdated();
      }
    } catch {
    } finally {
      setIsSavingTheme(false);
    }
  }

  async function handlePageSizeChange(value: string) {
    setPageSize(value);
    try {
      setIsSavingPrefs(true);
      const response = await fetch("/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: { defaultPageSize: parseInt(value, 10) },
        }),
      });

      if (response.ok) {
        toast.success("Seitengröße wurde gespeichert");
        onSettingsUpdated();
      } else {
        toast.error("Fehler beim Speichern der Seitengroesse");
      }
    } catch (error) {
      toast.error("Fehler beim Speichern der Seitengroesse");
    } finally {
      setIsSavingPrefs(false);
    }
  }

  async function handleStartPageChange(value: string) {
    setStartPage(value);
    try {
      setIsSavingPrefs(true);
      const response = await fetch("/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: { defaultStartPage: value },
        }),
      });

      if (response.ok) {
        toast.success("Startseite wurde gespeichert");
        onSettingsUpdated();
      } else {
        toast.error("Fehler beim Speichern der Startseite");
      }
    } catch (error) {
      toast.error("Fehler beim Speichern der Startseite");
    } finally {
      setIsSavingPrefs(false);
    }
  }

  const themeOptions = [
    {
      value: "light" as const,
      label: "Hell",
      icon: Sun,
    },
    {
      value: "dark" as const,
      label: "Dunkel",
      icon: Moon,
    },
    {
      value: "system" as const,
      label: "System",
      icon: Monitor,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Theme Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Darstellung</CardTitle>
          <CardDescription>
            Passen Sie das Erscheinungsbild der Anwendung an
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h4 className="font-medium mb-4">Design</h4>
            <div className="grid gap-4 sm:grid-cols-3">
              {themeOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={isSavingTheme}
                    onClick={() => handleThemeChange(option.value)}
                    className={`flex flex-col items-center gap-2 p-4 border rounded-lg transition-colors ${
                      theme === option.value
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted"
                    } ${isSavingTheme ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    <Icon className="h-8 w-8" />
                    <span className="font-medium">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="font-medium mb-4">Sprache</h4>
            <Select value="de" disabled>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="de">Deutsch</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-2">
              Weitere Sprachen in Planung
            </p>
          </div>
        </CardContent>
      </Card>

      {/* User Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Benutzereinstellungen</CardTitle>
          <CardDescription>
            Passen Sie das Verhalten der Anwendung an Ihre Beduerfnisse an
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Default Page Size */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Standard-Seitengroesse (Tabelleneintraege)
            </label>
            <Select
              value={pageSize}
              onValueChange={handlePageSizeChange}
              disabled={isSavingPrefs}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 Eintraege</SelectItem>
                <SelectItem value="25">25 Eintraege</SelectItem>
                <SelectItem value="50">50 Eintraege</SelectItem>
                <SelectItem value="100">100 Eintraege</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Bestimmt, wie viele Eintraege pro Seite in Tabellen angezeigt
              werden
            </p>
          </div>

          <Separator />

          {/* Default Start Page */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Standard-Startseite</label>
            <Select
              value={startPage}
              onValueChange={handleStartPageChange}
              disabled={isSavingPrefs}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="/dashboard">Dashboard</SelectItem>
                <SelectItem value="/parks">Windparks</SelectItem>
                <SelectItem value="/invoices">Rechnungen</SelectItem>
                <SelectItem value="/portal">Portal</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Die Seite, die nach dem Anmelden standardmaessig angezeigt wird
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Security Tab Component (Password + Session)
// =============================================================================

function SecurityTab({ settings }: { settings: UserSettings | null }) {
  const [isSaving, setIsSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  async function onPasswordSubmit(data: PasswordFormValues) {
    try {
      setIsSaving(true);
      setServerErrors({});

      const response = await fetch("/api/user/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.fieldErrors) {
          setServerErrors(result.fieldErrors);
          // Also set field-level errors on the form for better display
          for (const [field, message] of Object.entries(result.fieldErrors)) {
            if (
              field === "currentPassword" ||
              field === "newPassword" ||
              field === "confirmPassword"
            ) {
              passwordForm.setError(field as keyof PasswordFormValues, {
                type: "server",
                message: message as string,
              });
            }
          }
          return;
        }
        throw new Error(result.error || "Fehler beim Aendern des Passworts");
      }

      toast.success("Passwort wurde erfolgreich geaendert");
      passwordForm.reset();
      setServerErrors({});
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Aendern des Passworts"
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Password Change Card */}
      <Card>
        <CardHeader>
          <CardTitle>Passwort aendern</CardTitle>
          <CardDescription>
            Aktualisieren Sie Ihr Passwort regelmaessig fuer mehr Sicherheit
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...passwordForm}>
            <form
              onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
              className="space-y-4"
            >
              <FormField
                control={passwordForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Aktuelles Passwort</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Aktuelles Passwort eingeben"
                        autoComplete="current-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                    {serverErrors.currentPassword && (
                      <p className="text-sm font-medium text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {serverErrors.currentPassword}
                      </p>
                    )}
                  </FormItem>
                )}
              />

              <FormField
                control={passwordForm.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Neues Passwort</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Neues Passwort eingeben"
                        autoComplete="new-password"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Mindestens 8 Zeichen</FormDescription>
                    <FormMessage />
                    {serverErrors.newPassword && (
                      <p className="text-sm font-medium text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {serverErrors.newPassword}
                      </p>
                    )}
                  </FormItem>
                )}
              />

              <FormField
                control={passwordForm.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Passwort bestaetigen</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Neues Passwort wiederholen"
                        autoComplete="new-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                    {serverErrors.confirmPassword && (
                      <p className="text-sm font-medium text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {serverErrors.confirmPassword}
                      </p>
                    )}
                  </FormItem>
                )}
              />

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="mr-2 h-4 w-4" />
                  )}
                  Passwort aendern
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Current Session Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Aktuelle Sitzung</CardTitle>
          <CardDescription>
            Informationen zu Ihrer aktuellen Anmeldung
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium">Aktuelle Sitzung</p>
              <p className="text-sm text-muted-foreground">
                {settings?.email || "---"}
              </p>
              {settings?.lastLoginAt && (
                <p className="text-sm text-muted-foreground">
                  Letzte Anmeldung:{" "}
                  {new Date(settings.lastLoginAt).toLocaleString("de-DE", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              )}
            </div>
            <Badge variant="secondary">Aktiv</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Skeleton Components
// =============================================================================

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <Skeleton className="h-24 w-24 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-9 w-36" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="flex justify-end">
            <Skeleton className="h-10 w-28" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// =============================================================================
// Main Settings Page
// =============================================================================

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { hasPermission, role } = usePermissions();
  const canManageFeatures = role === "SUPERADMIN" || hasPermission("settings:update");

  const loadSettings = useCallback(async () => {
    try {
      setLoadError(null);
      const response = await fetch("/api/user/settings");

      if (!response.ok) {
        throw new Error("Fehler beim Laden der Einstellungen");
      }

      const data: UserSettings = await response.json();
      setSettings(data);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Fehler beim Laden der Einstellungen"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  if (loadError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Einstellungen</h1>
          <p className="text-muted-foreground">
            Verwalten Sie Ihre persoenlichen Einstellungen und Praeferenzen
          </p>
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
              <p className="text-destructive mb-4">{loadError}</p>
              <Button
                variant="outline"
                onClick={() => {
                  setIsLoading(true);
                  loadSettings();
                }}
              >
                Erneut versuchen
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Einstellungen</h1>
        <p className="text-muted-foreground">
          Verwalten Sie Ihre persoenlichen Einstellungen und Praeferenzen
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Profil
          </TabsTrigger>
          <TabsTrigger
            value="notifications"
            className="flex items-center gap-2"
          >
            <Bell className="h-4 w-4" />
            Benachrichtigungen
          </TabsTrigger>
          <TabsTrigger value="appearance" className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Darstellung
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Sicherheit
          </TabsTrigger>
          {canManageFeatures && (
            <TabsTrigger value="features" className="flex items-center gap-2">
              <ToggleLeft className="h-4 w-4" />
              Module
            </TabsTrigger>
          )}
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <ProfileTab
            settings={settings}
            onSettingsUpdated={loadSettings}
          />
        </TabsContent>

        {/* Notifications Tab - uses existing NotificationPreferences component */}
        <TabsContent value="notifications">
          <NotificationPreferences />
        </TabsContent>

        {/* Appearance Tab */}
        <TabsContent value="appearance">
          <AppearanceTab
            settings={settings}
            onSettingsUpdated={loadSettings}
          />
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <SecurityTab settings={settings} />
        </TabsContent>

        {/* Features/Module Tab (only for admins) */}
        {canManageFeatures && (
          <TabsContent value="features">
            <TenantFeaturesSettings />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
