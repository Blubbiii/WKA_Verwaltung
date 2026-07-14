/**
 * Zentrale URLs zu externen Services — env-überschreibbar für Custom-Deployments
 * (z.B. EU-Proxies, Self-Hosted Forks). Defaults sind die jeweiligen Production-URLs.
 *
 * `satisfies` erhält die Literal-Keys (Autocomplete: `EXTERNAL_APIS.SMARD_BASE`),
 * lässt aber trotzdem den Compiler prüfen, dass alle Werte tatsächlich Strings sind.
 */
export const EXTERNAL_APIS = {
  OPENMETEO_FORECAST: process.env.OPENMETEO_FORECAST_URL || "https://api.open-meteo.com/v1/forecast",
  OPENMETEO_ARCHIVE: process.env.OPENMETEO_ARCHIVE_URL || "https://archive-api.open-meteo.com/v1/archive",
  SMARD_BASE: process.env.SMARD_BASE_URL || "https://www.smard.de/app/chart_data",
  DWD_BASE: process.env.DWD_BASE_URL || "https://opendata.dwd.de/climate_environment/CDC",
  SENDGRID_MAIL: process.env.SENDGRID_API_BASE_URL || "https://api.sendgrid.com/v3/mail/send",
} satisfies Record<string, string>;
