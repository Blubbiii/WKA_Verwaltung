/**
 * System Configuration Service
 *
 * Provides centralized access to system configuration stored in the database.
 * Supports encryption for sensitive values and fallback to environment variables.
 */

import { prisma, hasPrismaModel, getPrismaModel } from "@/lib/prisma";
import { encrypt, decrypt, maskSensitive } from "@/lib/email/encryption";
import { logger } from "@/lib/logger";

// Type for SystemConfig until Prisma is regenerated
interface SystemConfigRecord {
  id: string;
  key: string;
  value: string;
  encrypted: boolean;
  category: string;
  label: string | null;
  tenantId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// TYPES
// =============================================================================

export type ConfigCategory = "email" | "weather" | "storage" | "general" | "features" | "paperless" | "communication";

export interface ConfigValue {
  key: string;
  value: string;
  encrypted: boolean;
  category: ConfigCategory;
  label: string | null;
  tenantId: string | null;
  updatedAt: Date;
}

export interface SetConfigOptions {
  category: ConfigCategory;
  encrypted?: boolean;
  label?: string;
  tenantId?: string | null;
}

// =============================================================================
// CONFIGURATION KEYS AND THEIR PROPERTIES
// =============================================================================

/**
 * Registry of known config keys with their metadata
 */
export const CONFIG_KEYS = {
  // Email Configuration
  "email.smtp.host": {
    category: "email" as ConfigCategory,
    label: "SMTP Server Host",
    encrypted: false,
    envFallback: "SMTP_HOST",
  },
  "email.smtp.port": {
    category: "email" as ConfigCategory,
    label: "SMTP Server Port",
    encrypted: false,
    envFallback: "SMTP_PORT",
    defaultValue: "587",
  },
  "email.smtp.user": {
    category: "email" as ConfigCategory,
    label: "SMTP Benutzername",
    encrypted: false,
    envFallback: "SMTP_USER",
  },
  "email.smtp.password": {
    category: "email" as ConfigCategory,
    label: "SMTP Passwort",
    encrypted: true,
    envFallback: "SMTP_PASS",
  },
  "email.smtp.secure": {
    category: "email" as ConfigCategory,
    label: "TLS/SSL aktiviert",
    encrypted: false,
    envFallback: "SMTP_SECURE",
    defaultValue: "true",
  },
  "email.from.address": {
    category: "email" as ConfigCategory,
    label: "Absender E-Mail-Adresse",
    encrypted: false,
    envFallback: "EMAIL_FROM_ADDRESS",
  },
  "email.from.name": {
    category: "email" as ConfigCategory,
    label: "Absender Name",
    encrypted: false,
    envFallback: "EMAIL_FROM_NAME",
    defaultValue: "WindparkManager",
  },

  // Weather API (Open-Meteo is used — this key is no longer required)
  "weather.api.key": {
    category: "weather" as ConfigCategory,
    label: "Wetter-API Key (veraltet — Open-Meteo benötigt keinen Key)",
    encrypted: true,
    envFallback: "OPENWEATHERMAP_API_KEY",
  },
  "weather.sync.interval": {
    category: "weather" as ConfigCategory,
    label: "Sync Intervall (Minuten)",
    encrypted: false,
    envFallback: "WEATHER_SYNC_INTERVAL",
    defaultValue: "60",
  },
  "weather.cache.ttl": {
    category: "weather" as ConfigCategory,
    label: "Cache TTL (Minuten)",
    encrypted: false,
    envFallback: "WEATHER_CACHE_TTL",
    defaultValue: "15",
  },

  // Storage Configuration
  "storage.provider": {
    category: "storage" as ConfigCategory,
    label: "Storage Provider",
    encrypted: false,
    envFallback: "STORAGE_PROVIDER",
    defaultValue: "local",
  },
  "storage.s3.endpoint": {
    category: "storage" as ConfigCategory,
    label: "S3 Endpoint URL",
    encrypted: false,
    envFallback: "S3_ENDPOINT",
  },
  "storage.s3.bucket": {
    category: "storage" as ConfigCategory,
    label: "S3 Bucket Name",
    encrypted: false,
    envFallback: "S3_BUCKET",
  },
  "storage.s3.accessKey": {
    category: "storage" as ConfigCategory,
    label: "S3 Access Key",
    encrypted: true,
    envFallback: "S3_ACCESS_KEY",
  },
  "storage.s3.secretKey": {
    category: "storage" as ConfigCategory,
    label: "S3 Secret Key",
    encrypted: true,
    envFallback: "S3_SECRET_KEY",
  },
  "storage.s3.region": {
    category: "storage" as ConfigCategory,
    label: "S3 Region",
    encrypted: false,
    envFallback: "S3_REGION",
    defaultValue: "eu-central-1",
  },

  // General Configuration
  "general.app.name": {
    category: "general" as ConfigCategory,
    label: "Anwendungsname",
    encrypted: false,
    envFallback: "APP_NAME",
    defaultValue: "WindparkManager",
  },
  "general.app.timezone": {
    category: "general" as ConfigCategory,
    label: "Zeitzone",
    encrypted: false,
    envFallback: "APP_TIMEZONE",
    defaultValue: "Europe/Berlin",
  },
  "general.maintenance.enabled": {
    category: "general" as ConfigCategory,
    label: "Wartungsmodus aktiviert",
    encrypted: false,
    envFallback: "MAINTENANCE_MODE",
    defaultValue: "false",
  },
  "general.maintenance.message": {
    category: "general" as ConfigCategory,
    label: "Wartungsmodus Nachricht",
    encrypted: false,
    envFallback: "MAINTENANCE_MESSAGE",
    defaultValue: "Das System wird gewartet. Bitte versuchen Sie es später erneut.",
  },
  // Feature Flags
  "management-billing.enabled": {
    category: "features" as ConfigCategory,
    label: "Betriebsführung aktiviert",
    encrypted: false,
    envFallback: "MANAGEMENT_BILLING_ENABLED",
    defaultValue: "false",
  },
  "paperless.enabled": {
    category: "features" as ConfigCategory,
    label: "Paperless-ngx Integration",
    encrypted: false,
    envFallback: "PAPERLESS_ENABLED",
    defaultValue: "false",
  },
  "communication.enabled": {
    category: "features" as ConfigCategory,
    label: "Kommunikation (Serienbriefe, Massen-E-Mail)",
    encrypted: false,
    envFallback: "COMMUNICATION_ENABLED",
    defaultValue: "false",
  },
  "crm.enabled": {
    category: "features" as ConfigCategory,
    label: "CRM (Kontaktpflege & Aktivitäten)",
    encrypted: false,
    envFallback: "CRM_ENABLED",
    defaultValue: "false",
  },
  "inbox.enabled": {
    category: "features" as ConfigCategory,
    label: "Eingangsrechnungen & Gutschriften (Inbox)",
    encrypted: false,
    envFallback: "INBOX_ENABLED",
    defaultValue: "false",
  },
  "wirtschaftsplan.enabled": {
    category: "features" as ConfigCategory,
    label: "Wirtschaftsplan & Kostenstellenmanagement",
    encrypted: false,
    envFallback: "WIRTSCHAFTSPLAN_ENABLED",
    defaultValue: "false",
  },
  "accounting.enabled": {
    category: "features" as ConfigCategory,
    label: "Buchhaltung (Master-Schalter)",
    encrypted: false,
    envFallback: "ACCOUNTING_ENABLED",
    defaultValue: "false",
  },
  // Accounting Sub-Modules (default true — visible when master is on, unless explicitly disabled)
  "accounting.reports.enabled": {
    category: "features" as ConfigCategory,
    label: "Reports (SuSa, BWA, EÜR, GuV)",
    encrypted: false,
    defaultValue: "true",
  },
  "accounting.bank.enabled": {
    category: "features" as ConfigCategory,
    label: "Bankimport & Zahlungsabgleich",
    encrypted: false,
    defaultValue: "true",
  },
  "accounting.dunning.enabled": {
    category: "features" as ConfigCategory,
    label: "Mahnwesen",
    encrypted: false,
    defaultValue: "true",
  },
  "accounting.sepa.enabled": {
    category: "features" as ConfigCategory,
    label: "SEPA-Export",
    encrypted: false,
    defaultValue: "true",
  },
  "accounting.ustva.enabled": {
    category: "features" as ConfigCategory,
    label: "UStVA & Zusammenfassende Meldung",
    encrypted: false,
    defaultValue: "true",
  },
  "accounting.assets.enabled": {
    category: "features" as ConfigCategory,
    label: "Anlagen & Abschreibungen (AfA)",
    encrypted: false,
    defaultValue: "true",
  },
  "accounting.cashbook.enabled": {
    category: "features" as ConfigCategory,
    label: "Kassenbuch",
    encrypted: false,
    defaultValue: "true",
  },
  "accounting.datev.enabled": {
    category: "features" as ConfigCategory,
    label: "DATEV-Export",
    encrypted: false,
    defaultValue: "true",
  },
  "accounting.yearend.enabled": {
    category: "features" as ConfigCategory,
    label: "Jahresabschluss",
    encrypted: false,
    defaultValue: "true",
  },
  "accounting.costcenter.enabled": {
    category: "features" as ConfigCategory,
    label: "Kostenstellen-Report",
    encrypted: false,
    defaultValue: "true",
  },
  "accounting.budget.enabled": {
    category: "features" as ConfigCategory,
    label: "Budget Soll/Ist-Vergleich",
    encrypted: false,
    defaultValue: "true",
  },
  "accounting.quotes.enabled": {
    category: "features" as ConfigCategory,
    label: "Angebote → Rechnungen",
    encrypted: false,
    defaultValue: "true",
  },
  "accounting.liquidity.enabled": {
    category: "features" as ConfigCategory,
    label: "Liquiditätsplanung",
    encrypted: false,
    defaultValue: "true",
  },
  "accounting.ocr.enabled": {
    category: "features" as ConfigCategory,
    label: "OCR-Belegerfassung",
    encrypted: false,
    defaultValue: "false",
  },
  "accounting.multibanking.enabled": {
    category: "features" as ConfigCategory,
    label: "Multibanking (Live-Anbindung)",
    encrypted: false,
    defaultValue: "false",
  },
  "document-routing.enabled": {
    category: "features" as ConfigCategory,
    label: "Dokument-Routing (OneDrive/DATEV Ordner-Zuordnung)",
    encrypted: false,
    envFallback: "DOCUMENT_ROUTING_ENABLED",
    defaultValue: "false",
  },
  "meilisearch.enabled": {
    category: "features" as ConfigCategory,
    label: "Meilisearch Volltextsuche",
    encrypted: false,
    envFallback: "MEILISEARCH_ENABLED",
    defaultValue: "false",
  },

  // Paperless-ngx Configuration
  "paperless.url": {
    category: "paperless" as ConfigCategory,
    label: "Paperless-ngx Server URL",
    encrypted: false,
    envFallback: "PAPERLESS_URL",
    defaultValue: "",
  },
  "paperless.token": {
    category: "paperless" as ConfigCategory,
    label: "API Token",
    encrypted: true,
    envFallback: "PAPERLESS_API_TOKEN",
  },
  "paperless.auto-archive": {
    category: "paperless" as ConfigCategory,
    label: "Automatische Archivierung",
    encrypted: false,
    envFallback: "PAPERLESS_AUTO_ARCHIVE",
    defaultValue: "true",
  },
  "paperless.default-document-type": {
    category: "paperless" as ConfigCategory,
    label: "Standard-Dokumenttyp",
    encrypted: false,
    envFallback: "PAPERLESS_DEFAULT_DOCUMENT_TYPE",
    defaultValue: "",
  },
} as const;

export type ConfigKey = keyof typeof CONFIG_KEYS;

// =============================================================================
// CONFIG SERVICE FUNCTIONS
// =============================================================================

/**
 * Get a configuration value by key
 *
 * Priority:
 * 1. Tenant-specific DB value (if tenantId provided)
 * 2. Global DB value (tenantId = null)
 * 3. Environment variable fallback
 * 4. Default value from CONFIG_KEYS
 *
 * @param key - The configuration key
 * @param tenantId - Optional tenant ID for tenant-specific config
 * @returns The configuration value (decrypted if needed) or null
 */
export async function getConfig(
  key: ConfigKey | string,
  tenantId?: string | null
): Promise<string | null> {
  try {
    // Try to get from database using raw query for compatibility
    // Check if systemConfig model exists (after migration)
    if (!hasPrismaModel("systemConfig")) {
      // Model not yet available, fall back to env variables
      const keyConfig = CONFIG_KEYS[key as ConfigKey];
      if (keyConfig && "envFallback" in keyConfig && keyConfig.envFallback) {
        const envValue = process.env[keyConfig.envFallback as string];
        if (envValue) return envValue;
      }
      if (keyConfig && "defaultValue" in keyConfig) {
        return keyConfig.defaultValue;
      }
      return null;
    }

    const systemConfig = getPrismaModel("systemConfig");
    const configs = await systemConfig.findMany({
      where: {
        key,
        OR: [
          { tenantId: tenantId || null },
          { tenantId: null },
        ],
      },
      orderBy: {
        tenantId: "desc", // Tenant-specific first (not null comes before null)
      },
    }) as unknown as SystemConfigRecord[];

    // Prefer tenant-specific config
    const config = configs.find((c) => c.tenantId === tenantId) || configs.find((c) => c.tenantId === null);

    if (config) {
      // Decrypt if necessary
      if (config.encrypted && config.value) {
        try {
          return decrypt(config.value);
        } catch (error) {
          logger.error({ err: error }, `[Config] Failed to decrypt ${key}`);
          return null;
        }
      }
      return config.value;
    }

    // Fallback to environment variable
    const keyConfig = CONFIG_KEYS[key as ConfigKey];
    if (keyConfig && "envFallback" in keyConfig && keyConfig.envFallback) {
      const envValue = process.env[keyConfig.envFallback as string];
      if (envValue) {
        return envValue;
      }
    }

    // Return default value if available
    if (keyConfig && "defaultValue" in keyConfig) {
      return keyConfig.defaultValue;
    }

    return null;
  } catch (error) {
    logger.error({ err: error }, `[Config] Error getting config ${key}`);

    // Try environment fallback on error
    const keyConfig = CONFIG_KEYS[key as ConfigKey];
    if (keyConfig && "envFallback" in keyConfig && keyConfig.envFallback) {
      return process.env[keyConfig.envFallback as string] || null;
    }

    return null;
  }
}

/**
 * Get a configuration value with type coercion
 */
export async function getConfigNumber(
  key: ConfigKey | string,
  tenantId?: string | null,
  defaultValue: number = 0
): Promise<number> {
  const value = await getConfig(key, tenantId);
  if (value === null) return defaultValue;
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
}

export async function getConfigBoolean(
  key: ConfigKey | string,
  tenantId?: string | null,
  defaultValue: boolean = false
): Promise<boolean> {
  const value = await getConfig(key, tenantId);
  if (value === null) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

/**
 * Set a configuration value
 *
 * @param key - The configuration key
 * @param value - The value to set
 * @param options - Options including category, encrypted, label, tenantId
 */
export async function setConfig(
  key: ConfigKey | string,
  value: string,
  options: SetConfigOptions
): Promise<ConfigValue> {
  const { category, encrypted = false, label, tenantId = null } = options;

  // Encrypt value if needed
  const storedValue = encrypted ? encrypt(value) : value;

  // Check if systemConfig model exists
  if (!hasPrismaModel("systemConfig")) {
    throw new Error("SystemConfig model not available. Please run prisma generate and migrate.");
  }

  const systemConfig = getPrismaModel("systemConfig");

  // Upsert the config
  // Prisma cannot use upsert on a composite unique with null tenantId,
  // so fall back to findFirst + create/update for global configs.
  let config: SystemConfigRecord;

  if (tenantId) {
    config = await systemConfig.upsert({
      where: {
        tenantId_key: {
          tenantId,
          key,
        },
      },
      update: {
        value: storedValue,
        encrypted,
        category,
        label: label || null,
        updatedAt: new Date(),
      },
      create: {
        key,
        value: storedValue,
        encrypted,
        category,
        label: label || null,
        tenantId,
      },
    }) as unknown as SystemConfigRecord;
  } else {
    // Global config (tenantId = null): manual find + create/update
    const existing = await systemConfig.findFirst({
      where: { key, tenantId: null },
    });

    if (existing) {
      config = await systemConfig.update({
        where: { id: existing.id },
        data: {
          value: storedValue,
          encrypted,
          category,
          label: label || null,
          updatedAt: new Date(),
        },
      }) as unknown as SystemConfigRecord;
    } else {
      config = await systemConfig.create({
        data: {
          key,
          value: storedValue,
          encrypted,
          category,
          label: label || null,
          tenantId: null,
        },
      }) as unknown as SystemConfigRecord;
    }
  }

  return {
    key: config.key,
    value: encrypted ? maskSensitive(value) : value, // Return masked value for encrypted
    encrypted: config.encrypted,
    category: config.category as ConfigCategory,
    label: config.label,
    tenantId: config.tenantId,
    updatedAt: config.updatedAt,
  };
}

/**
 * Get all configurations for a category
 *
 * @param category - The configuration category
 * @param tenantId - Optional tenant ID for tenant-specific configs
 * @param includeMasked - Whether to mask sensitive values (default: true)
 */
export async function getConfigsByCategory(
  category: ConfigCategory,
  tenantId?: string | null,
  includeMasked: boolean = true
): Promise<ConfigValue[]> {
  let configs: SystemConfigRecord[] = [];

  // Check if systemConfig model exists
  if (hasPrismaModel("systemConfig")) {
    const systemConfig = getPrismaModel("systemConfig");
    configs = await systemConfig.findMany({
      where: {
        category,
        OR: [
          { tenantId: tenantId || null },
          { tenantId: null },
        ],
      },
      orderBy: [
        { tenantId: "desc" },
        { key: "asc" },
      ],
    }) as unknown as SystemConfigRecord[];
  }

  // Group by key, preferring tenant-specific
  const configMap = new Map<string, SystemConfigRecord>();
  for (const config of configs) {
    const existing = configMap.get(config.key);
    // Prefer tenant-specific (tenantId not null)
    if (!existing || (config.tenantId && !existing.tenantId)) {
      configMap.set(config.key, config);
    }
  }

  const result: ConfigValue[] = [];

  for (const config of configMap.values()) {
    let value = config.value;

    // Handle encrypted values
    if (config.encrypted && config.value) {
      if (includeMasked) {
        try {
          const decrypted = decrypt(config.value);
          value = maskSensitive(decrypted);
        } catch {
          value = "***";
        }
      } else {
        try {
          value = decrypt(config.value);
        } catch {
          value = "";
        }
      }
    }

    result.push({
      key: config.key,
      value,
      encrypted: config.encrypted,
      category: config.category as ConfigCategory,
      label: config.label,
      tenantId: config.tenantId,
      updatedAt: config.updatedAt,
    });
  }

  // Add missing keys with environment/default fallbacks
  const categoryKeys = Object.entries(CONFIG_KEYS)
    .filter(([, meta]) => meta.category === category)
    .map(([key]) => key);

  for (const key of categoryKeys) {
    if (!result.find((c) => c.key === key)) {
      const keyConfig = CONFIG_KEYS[key as ConfigKey];
      let value = "";

      // Try environment variable
      if ("envFallback" in keyConfig && keyConfig.envFallback) {
        const envValue = process.env[keyConfig.envFallback as string];
        if (envValue) {
          value = keyConfig.encrypted && includeMasked
            ? maskSensitive(envValue)
            : envValue;
        }
      }

      // Try default value
      if (!value && "defaultValue" in keyConfig) {
        value = keyConfig.defaultValue;
      }

      result.push({
        key,
        value,
        encrypted: keyConfig.encrypted || false,
        category,
        label: keyConfig.label,
        tenantId: null,
        updatedAt: new Date(),
      });
    }
  }

  return result.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Get all configurations (optionally filtered by tenant)
 */
export async function getAllConfigs(
  tenantId?: string | null,
  includeMasked: boolean = true
): Promise<ConfigValue[]> {
  const categories: ConfigCategory[] = ["email", "weather", "storage", "general", "features", "paperless", "communication"];
  const allConfigs: ConfigValue[] = [];

  for (const category of categories) {
    const configs = await getConfigsByCategory(category, tenantId, includeMasked);
    allConfigs.push(...configs);
  }

  return allConfigs;
}

/**
 * Delete a configuration value
 */
export async function deleteConfig(
  key: string,
  tenantId?: string | null
): Promise<boolean> {
  try {
    if (!hasPrismaModel("systemConfig")) {
      return false;
    }

    const systemConfig = getPrismaModel("systemConfig");
    await systemConfig.delete({
      where: {
        tenantId_key: {
          tenantId: tenantId ?? null,
          key,
        },
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Bulk set configurations
 */
export async function setConfigs(
  configs: Array<{ key: string; value: string; options: SetConfigOptions }>
): Promise<ConfigValue[]> {
  const results: ConfigValue[] = [];

  for (const { key, value, options } of configs) {
    const result = await setConfig(key, value, options);
    results.push(result);
  }

  return results;
}

/**
 * Get email configuration as a structured object
 * Convenience function for email sending
 */
export async function getEmailConfig(tenantId?: string | null): Promise<{
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromAddress: string;
  fromName: string;
} | null> {
  const host = await getConfig("email.smtp.host", tenantId);
  const port = await getConfigNumber("email.smtp.port", tenantId, 587);
  const secure = await getConfigBoolean("email.smtp.secure", tenantId, true);
  const user = await getConfig("email.smtp.user", tenantId);
  const password = await getConfig("email.smtp.password", tenantId);
  const fromAddress = await getConfig("email.from.address", tenantId);
  const fromName = await getConfig("email.from.name", tenantId) || "WindparkManager";

  if (!host || !user || !password) {
    return null;
  }

  return {
    host,
    port,
    secure,
    user,
    password,
    fromAddress: fromAddress || user,
    fromName,
  };
}

/**
 * Get weather API configuration
 * Convenience function for weather service
 */
export async function getWeatherConfig(tenantId?: string | null): Promise<{
  apiKey: string;
  syncInterval: number;
  cacheTtl: number;
} | null> {
  const apiKey = await getConfig("weather.api.key", tenantId);
  const syncInterval = await getConfigNumber("weather.sync.interval", tenantId, 60);
  const cacheTtl = await getConfigNumber("weather.cache.ttl", tenantId, 15);

  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    syncInterval,
    cacheTtl,
  };
}

/**
 * Get Paperless-ngx configuration
 * Convenience function for Paperless integration
 */
export async function getPaperlessConfig(tenantId?: string | null): Promise<{
  url: string;
  token: string;
  autoArchive: boolean;
  defaultDocumentType: string;
} | null> {
  const enabled = await getConfigBoolean("paperless.enabled", tenantId, false);
  if (!enabled) return null;

  const url = await getConfig("paperless.url", tenantId);
  const token = await getConfig("paperless.token", tenantId);
  const autoArchive = await getConfigBoolean("paperless.auto-archive", tenantId, true);
  const defaultDocumentType = await getConfig("paperless.default-document-type", tenantId) || "";

  if (!url || !token) return null;

  return {
    url: url.replace(/\/+$/, ""), // Strip trailing slashes
    token,
    autoArchive,
    defaultDocumentType,
  };
}

/**
 * Check if a config key is known/registered
 */
export function isKnownConfigKey(key: string): key is ConfigKey {
  return key in CONFIG_KEYS;
}

/**
 * Get metadata for a config key
 */
export function getConfigKeyMetadata(key: string) {
  return CONFIG_KEYS[key as ConfigKey] || null;
}
