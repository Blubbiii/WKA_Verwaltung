import useSWR from "swr";

export interface GeneralSettings {
  // Application Settings
  applicationName: string;
  defaultTimezone: string;
  defaultLanguage: string;
  dateFormat: string;
  currency: string;

  // Maintenance Mode
  maintenanceModeEnabled: boolean;
  maintenanceMessage: string;
  scheduledMaintenanceTime: string | null;

  // Security Settings
  sessionTimeoutMinutes: number;
  maxLoginAttempts: number;
  minPasswordLength: number;
  passwordRequiresSpecialChar: boolean;
  passwordRequiresNumber: boolean;

  // Notifications
  emailNotificationsEnabled: boolean;
  adminEmail: string;
}

export const DEFAULT_SETTINGS: GeneralSettings = {
  // Application Settings
  applicationName: "Windpark Manager",
  defaultTimezone: "Europe/Berlin",
  defaultLanguage: "de",
  dateFormat: "DD.MM.YYYY",
  currency: "EUR",

  // Maintenance Mode
  maintenanceModeEnabled: false,
  maintenanceMessage: "Das System wird gewartet. Bitte versuchen Sie es später erneut.",
  scheduledMaintenanceTime: null,

  // Security Settings
  sessionTimeoutMinutes: 30,
  maxLoginAttempts: 5,
  minPasswordLength: 8,
  passwordRequiresSpecialChar: true,
  passwordRequiresNumber: true,

  // Notifications
  emailNotificationsEnabled: true,
  adminEmail: "",
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Fehler beim Laden der Einstellungen");
  }
  return response.json();
};

export function useGeneralSettings() {
  const { data, error, isLoading, mutate } = useSWR<GeneralSettings>(
    "/api/admin/settings",
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 30000, // 30 seconds
    }
  );

  return {
    settings: data,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}

export async function updateGeneralSettings(
  settings: GeneralSettings
): Promise<GeneralSettings> {
  const response = await fetch("/api/admin/settings", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(settings),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Fehler beim Speichern der Einstellungen");
  }

  return response.json();
}
