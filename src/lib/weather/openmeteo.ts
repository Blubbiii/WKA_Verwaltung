/**
 * Open-Meteo API Client
 *
 * Free weather API — no API key required, EU-based, GDPR-compliant.
 * Replaces OpenWeatherMap with equivalent functionality plus:
 *  - 14-day forecast (vs. 5-day)
 *  - Historical data back to 1940 (was paid-only in OWM)
 *
 * API docs: https://open-meteo.com/en/docs
 */

import { logger } from "@/lib/logger";
import {
  CurrentWeather,
  DailyForecast,
  HourlyForecast,
  WMO_CODES,
  getWindDirectionLabel,
  WeatherApiError,
} from "./types";

// =============================================================================
// Constants
// =============================================================================

const FORECAST_API = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_API  = "https://archive-api.open-meteo.com/v1/archive";

// Map WMO weather codes to OWM-style icon codes for UI backward compatibility
const WMO_TO_ICON: Record<number, string> = {
  0: "01d", 1: "02d", 2: "03d", 3: "04d",
  45: "50d", 48: "50d",
  51: "09d", 53: "09d", 55: "09d",
  61: "10d", 63: "10d", 65: "10d",
  66: "13d", 67: "13d",
  71: "13d", 73: "13d", 75: "13d", 77: "13d",
  80: "09d", 81: "09d", 82: "09d",
  85: "13d", 86: "13d",
  95: "11d", 96: "11d", 99: "11d",
};

// =============================================================================
// Internal Types
// =============================================================================

interface OpenMeteoForecastResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    surface_pressure: number;
    cloud_cover: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
    weather_code: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
    wind_gusts_10m: number[];
    precipitation_probability: number[];
    precipitation: number[];
    weather_code: number[];
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    wind_speed_10m_max: number[];
    wind_gusts_10m_max: number[];
    wind_direction_10m_dominant: number[];
    weather_code: number[];
    precipitation_probability_max: number[];
    precipitation_sum: number[];
  };
}

interface OpenMeteoArchiveResponse {
  latitude: number;
  longitude: number;
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    wind_speed_10m_max: number[];
    wind_direction_10m_dominant: number[];
    precipitation_sum: number[];
    weather_code: number[];
  };
}

// =============================================================================
// Fetch Helper
// =============================================================================

async function apiFetch<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new WeatherApiError(
      `Open-Meteo API Fehler: ${response.status} ${response.statusText}`,
      response.status,
      body
    );
  }

  return response.json() as Promise<T>;
}

function wmoIcon(code: number): string {
  return WMO_TO_ICON[code] ?? "03d";
}

function wmoDescription(code: number): string {
  return WMO_CODES[code] ?? "Unbekannt";
}

// =============================================================================
// Public API — same signatures as openweathermap.ts
// =============================================================================

/** Open-Meteo needs no API key — always configured */
export function isWeatherApiConfigured(): boolean {
  return true;
}

/** Get current weather for coordinates */
export async function getCurrentWeather(lat: number, lon: number): Promise<CurrentWeather> {
  logger.info({ lat, lon }, "[Open-Meteo] Fetching current weather");

  const url =
    `${FORECAST_API}?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,` +
    `wind_gusts_10m,weather_code,relative_humidity_2m,surface_pressure,cloud_cover` +
    `&wind_speed_unit=ms&timezone=auto&forecast_days=1`;

  const data = await apiFetch<OpenMeteoForecastResponse>(url);
  const c = data.current;

  return {
    temperature:      Math.round(c.temperature_2m * 10) / 10,
    feelsLike:        Math.round(c.apparent_temperature * 10) / 10,
    humidity:         Math.round(c.relative_humidity_2m),
    pressure:         Math.round(c.surface_pressure),
    windSpeed:        Math.round(c.wind_speed_10m * 10) / 10,
    windDirection:    Math.round(c.wind_direction_10m),
    windDirectionLabel: getWindDirectionLabel(c.wind_direction_10m),
    windGust:         Math.round(c.wind_gusts_10m * 10) / 10,
    description:      wmoDescription(c.weather_code),
    icon:             wmoIcon(c.weather_code),
    cloudCover:       c.cloud_cover,
    visibility:       10000, // Open-Meteo basic plan doesn't include visibility
    sunrise:          new Date(), // not in basic endpoint — use current time as placeholder
    sunset:           new Date(),
    timestamp:        new Date(c.time),
  };
}

/** Get forecast for coordinates (up to 14 days) */
export async function getForecast(
  lat: number,
  lon: number,
  days: number = 14
): Promise<{ daily: DailyForecast[]; hourly: HourlyForecast[] }> {
  const forecastDays = Math.min(Math.max(days, 1), 14);
  logger.info({ lat, lon, forecastDays }, "[Open-Meteo] Fetching forecast");

  const url =
    `${FORECAST_API}?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,` +
    `wind_direction_10m_dominant,weather_code,precipitation_probability_max,precipitation_sum` +
    `&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,` +
    `precipitation_probability,precipitation,weather_code` +
    `&wind_speed_unit=ms&timezone=auto&forecast_days=${forecastDays}`;

  const data = await apiFetch<OpenMeteoForecastResponse>(url);
  const d = data.daily;
  const h = data.hourly;

  const daily: DailyForecast[] = d.time.map((date, i) => ({
    date,
    tempMin:                  Math.round((d.temperature_2m_min[i] ?? 0) * 10) / 10,
    tempMax:                  Math.round((d.temperature_2m_max[i] ?? 0) * 10) / 10,
    tempDay:                  Math.round(((d.temperature_2m_max[i] ?? 0) + (d.temperature_2m_min[i] ?? 0)) / 2 * 10) / 10,
    windSpeed:                Math.round((d.wind_speed_10m_max[i] ?? 0) * 10) / 10,
    windSpeedMax:             Math.round((d.wind_gusts_10m_max[i] ?? 0) * 10) / 10,
    windDirection:            Math.round(d.wind_direction_10m_dominant[i] ?? 0),
    humidity:                 0, // daily humidity not in basic endpoint
    pressure:                 0,
    description:              wmoDescription(d.weather_code[i] ?? 0),
    icon:                     wmoIcon(d.weather_code[i] ?? 0),
    precipitationProbability: d.precipitation_probability_max[i] ?? 0,
    precipitationAmount:      Math.round((d.precipitation_sum[i] ?? 0) * 10) / 10,
  }));

  const hourly: HourlyForecast[] = h.time.map((time, i) => ({
    datetime:                 new Date(time),
    temperature:              Math.round((h.temperature_2m[i] ?? 0) * 10) / 10,
    feelsLike:                Math.round((h.temperature_2m[i] ?? 0) * 10) / 10, // not in basic
    humidity:                 0,
    pressure:                 0,
    windSpeed:                Math.round((h.wind_speed_10m[i] ?? 0) * 10) / 10,
    windDirection:            Math.round(h.wind_direction_10m[i] ?? 0),
    windGust:                 Math.round((h.wind_gusts_10m[i] ?? 0) * 10) / 10,
    description:              wmoDescription(h.weather_code[i] ?? 0),
    icon:                     wmoIcon(h.weather_code[i] ?? 0),
    cloudCover:               0,
    precipitationProbability: h.precipitation_probability[i] ?? 0,
    precipitationAmount:      Math.round((h.precipitation[i] ?? 0) * 10) / 10,
  }));

  return { daily, hourly };
}

/** Get current weather + forecast in one call */
export async function getWeatherWithForecast(
  lat: number,
  lon: number,
  forecastDays: number = 14
): Promise<{ current: CurrentWeather; forecast: DailyForecast[]; hourlyForecast: HourlyForecast[] }> {
  const days = Math.min(Math.max(forecastDays, 1), 14);
  logger.info({ lat, lon, days }, "[Open-Meteo] Fetching weather + forecast");

  const url =
    `${FORECAST_API}?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,` +
    `wind_gusts_10m,weather_code,relative_humidity_2m,surface_pressure,cloud_cover` +
    `&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,` +
    `wind_direction_10m_dominant,weather_code,precipitation_probability_max,precipitation_sum` +
    `&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,` +
    `precipitation_probability,precipitation,weather_code` +
    `&wind_speed_unit=ms&timezone=auto&forecast_days=${days}`;

  const data = await apiFetch<OpenMeteoForecastResponse>(url);
  const c = data.current;
  const d = data.daily;
  const h = data.hourly;

  const current: CurrentWeather = {
    temperature:        Math.round(c.temperature_2m * 10) / 10,
    feelsLike:          Math.round(c.apparent_temperature * 10) / 10,
    humidity:           Math.round(c.relative_humidity_2m),
    pressure:           Math.round(c.surface_pressure),
    windSpeed:          Math.round(c.wind_speed_10m * 10) / 10,
    windDirection:      Math.round(c.wind_direction_10m),
    windDirectionLabel: getWindDirectionLabel(c.wind_direction_10m),
    windGust:           Math.round(c.wind_gusts_10m * 10) / 10,
    description:        wmoDescription(c.weather_code),
    icon:               wmoIcon(c.weather_code),
    cloudCover:         c.cloud_cover,
    visibility:         10000,
    sunrise:            new Date(),
    sunset:             new Date(),
    timestamp:          new Date(c.time),
  };

  const forecast: DailyForecast[] = d.time.map((date, i) => ({
    date,
    tempMin:                  Math.round((d.temperature_2m_min[i] ?? 0) * 10) / 10,
    tempMax:                  Math.round((d.temperature_2m_max[i] ?? 0) * 10) / 10,
    tempDay:                  Math.round(((d.temperature_2m_max[i] ?? 0) + (d.temperature_2m_min[i] ?? 0)) / 2 * 10) / 10,
    windSpeed:                Math.round((d.wind_speed_10m_max[i] ?? 0) * 10) / 10,
    windSpeedMax:             Math.round((d.wind_gusts_10m_max[i] ?? 0) * 10) / 10,
    windDirection:            Math.round(d.wind_direction_10m_dominant[i] ?? 0),
    humidity:                 0,
    pressure:                 0,
    description:              wmoDescription(d.weather_code[i] ?? 0),
    icon:                     wmoIcon(d.weather_code[i] ?? 0),
    precipitationProbability: d.precipitation_probability_max[i] ?? 0,
    precipitationAmount:      Math.round((d.precipitation_sum[i] ?? 0) * 10) / 10,
  }));

  const hourlyForecast: HourlyForecast[] = h.time.map((time, i) => ({
    datetime:                 new Date(time),
    temperature:              Math.round((h.temperature_2m[i] ?? 0) * 10) / 10,
    feelsLike:                Math.round((h.temperature_2m[i] ?? 0) * 10) / 10,
    humidity:                 0,
    pressure:                 0,
    windSpeed:                Math.round((h.wind_speed_10m[i] ?? 0) * 10) / 10,
    windDirection:            Math.round(h.wind_direction_10m[i] ?? 0),
    windGust:                 Math.round((h.wind_gusts_10m[i] ?? 0) * 10) / 10,
    description:              wmoDescription(h.weather_code[i] ?? 0),
    icon:                     wmoIcon(h.weather_code[i] ?? 0),
    cloudCover:               0,
    precipitationProbability: h.precipitation_probability[i] ?? 0,
    precipitationAmount:      Math.round((h.precipitation[i] ?? 0) * 10) / 10,
  }));

  return { current, forecast, hourlyForecast };
}

/**
 * Get historical weather from Open-Meteo archive API.
 * Returns daily summary for a single date (date param) — or null on error.
 * Unlike OWM, this is FREE and works without a paid subscription.
 */
export async function getHistoricalWeather(
  lat: number,
  lon: number,
  date: Date
): Promise<CurrentWeather | null> {
  const dateStr = date.toISOString().split("T")[0]!;
  logger.info({ lat, lon, date: dateStr }, "[Open-Meteo] Fetching historical weather");

  try {
    const url =
      `${ARCHIVE_API}?latitude=${lat}&longitude=${lon}` +
      `&start_date=${dateStr}&end_date=${dateStr}` +
      `&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,` +
      `wind_direction_10m_dominant,precipitation_sum,weather_code` +
      `&wind_speed_unit=ms&timezone=auto`;

    const data = await apiFetch<OpenMeteoArchiveResponse>(url);
    const d = data.daily;

    if (!d.time.length) return null;

    const tempMax = d.temperature_2m_max[0] ?? 0;
    const tempMin = d.temperature_2m_min[0] ?? 0;
    const code    = d.weather_code[0] ?? 0;

    return {
      temperature:        Math.round((tempMax + tempMin) / 2 * 10) / 10,
      feelsLike:          Math.round((tempMax + tempMin) / 2 * 10) / 10,
      humidity:           0,
      pressure:           0,
      windSpeed:          Math.round((d.wind_speed_10m_max[0] ?? 0) * 10) / 10,
      windDirection:      Math.round(d.wind_direction_10m_dominant[0] ?? 0),
      windDirectionLabel: getWindDirectionLabel(d.wind_direction_10m_dominant[0] ?? 0),
      windGust:           undefined,
      description:        wmoDescription(code),
      icon:               wmoIcon(code),
      cloudCover:         0,
      visibility:         10000,
      sunrise:            new Date(dateStr),
      sunset:             new Date(dateStr),
      timestamp:          new Date(dateStr),
    };
  } catch (error) {
    logger.warn({ err: error, lat, lon, date: dateStr }, "[Open-Meteo] Historical fetch failed");
    return null;
  }
}

/**
 * Fetch a date range from the archive API — used for filling historical DB gaps.
 * Returns one row per day.
 */
export async function getHistoricalRange(
  lat: number,
  lon: number,
  from: Date,
  to: Date
): Promise<Array<{
  date: string;
  tempMax: number;
  tempMin: number;
  windSpeedMax: number;
  windDirection: number;
  precipitationSum: number;
  weatherCode: number;
}>> {
  const startDate = from.toISOString().split("T")[0]!;
  const endDate   = to.toISOString().split("T")[0]!;

  logger.info({ lat, lon, startDate, endDate }, "[Open-Meteo] Fetching historical range");

  const url =
    `${ARCHIVE_API}?latitude=${lat}&longitude=${lon}` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,` +
    `wind_direction_10m_dominant,precipitation_sum,weather_code` +
    `&wind_speed_unit=ms&timezone=auto`;

  const data = await apiFetch<OpenMeteoArchiveResponse>(url);
  const d = data.daily;

  return d.time.map((date, i) => ({
    date,
    tempMax:          d.temperature_2m_max[i] ?? 0,
    tempMin:          d.temperature_2m_min[i] ?? 0,
    windSpeedMax:     d.wind_speed_10m_max[i] ?? 0,
    windDirection:    d.wind_direction_10m_dominant[i] ?? 0,
    precipitationSum: d.precipitation_sum[i] ?? 0,
    weatherCode:      d.weather_code[i] ?? 0,
  }));
}

/** No rate limit needed — Open-Meteo is free and generous */
export function getRateLimitStatus(): {
  requestsInWindow: number;
  maxRequests: number;
  windowMs: number;
} {
  return { requestsInWindow: 0, maxRequests: 10000, windowMs: 60000 };
}

/** Test API connection */
export async function testApiConnection(): Promise<{
  success: boolean;
  message: string;
  latency?: number;
}> {
  try {
    const start = Date.now();
    await getCurrentWeather(52.52, 13.405);
    return { success: true, message: "Verbindung erfolgreich", latency: Date.now() - start };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unbekannter Fehler",
    };
  }
}
