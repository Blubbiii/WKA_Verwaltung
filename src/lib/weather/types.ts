/**
 * Weather Integration Types
 *
 * TypeScript interfaces for weather data in WindparkManager.
 * Uses Open-Meteo (WMO weather codes) as the primary provider.
 */

// =============================================================================
// WMO Weather Codes (Open-Meteo standard)
// =============================================================================

/** WMO weather code descriptions in German */
export const WMO_CODES: Record<number, string> = {
  0:  "Klarer Himmel",
  1:  "Überwiegend klar",
  2:  "Teils bewölkt",
  3:  "Bedeckt",
  45: "Nebel",
  48: "Nebel mit Reif",
  51: "Leichter Nieselregen",
  53: "Mäßiger Nieselregen",
  55: "Starker Nieselregen",
  56: "Gefrierender Nieselregen (leicht)",
  57: "Gefrierender Nieselregen (stark)",
  61: "Leichter Regen",
  63: "Mäßiger Regen",
  65: "Starker Regen",
  66: "Gefrierender Regen (leicht)",
  67: "Gefrierender Regen (stark)",
  71: "Leichter Schneefall",
  73: "Mäßiger Schneefall",
  75: "Starker Schneefall",
  77: "Schneegriesel",
  80: "Leichte Regenschauer",
  81: "Mäßige Regenschauer",
  82: "Starke Regenschauer",
  85: "Leichte Schneeschauer",
  86: "Starke Schneeschauer",
  95: "Gewitter",
  96: "Gewitter mit leichtem Hagel",
  99: "Gewitter mit schwerem Hagel",
};

// Backward-compatibility alias
export const WEATHER_CONDITIONS = WMO_CODES as Record<number | string, string>;

// =============================================================================
// Internal Weather Data Types
// =============================================================================

/**
 * Wind direction labels (German)
 */
export function getWindDirectionLabel(degrees: number): string {
  const directions = [
    "N", "NNO", "NO", "ONO",
    "O", "OSO", "SO", "SSO",
    "S", "SSW", "SW", "WSW",
    "W", "WNW", "NW", "NNW"
  ];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

/**
 * Wind direction full labels (German)
 */
export function getWindDirectionFullLabel(degrees: number): string {
  const directions: Record<string, string> = {
    "N": "Nord",
    "NNO": "Nord-Nordost",
    "NO": "Nordost",
    "ONO": "Ost-Nordost",
    "O": "Ost",
    "OSO": "Ost-Suedost",
    "SO": "Suedost",
    "SSO": "Sued-Suedost",
    "S": "Sued",
    "SSW": "Sued-Suedwest",
    "SW": "Suedwest",
    "WSW": "West-Suedwest",
    "W": "West",
    "WNW": "West-Nordwest",
    "NW": "Nordwest",
    "NNW": "Nord-Nordwest",
  };
  return directions[getWindDirectionLabel(degrees)] || "Unbekannt";
}

/**
 * Current weather data structure
 */
export interface CurrentWeather {
  temperature: number; // Celsius
  feelsLike: number; // Celsius
  humidity: number; // Percent
  pressure: number; // hPa
  windSpeed: number; // m/s
  windDirection: number; // Degrees
  windDirectionLabel: string; // e.g., "NW"
  windGust?: number; // m/s
  description: string; // German description
  icon: string; // OpenWeatherMap icon code
  cloudCover: number; // Percent
  visibility: number; // meters
  sunrise: Date;
  sunset: Date;
  timestamp: Date;
}

/**
 * Daily forecast data structure
 */
export interface DailyForecast {
  date: string; // ISO date string (YYYY-MM-DD)
  tempMin: number; // Celsius
  tempMax: number; // Celsius
  tempDay: number; // Celsius (average)
  windSpeed: number; // m/s (average)
  windSpeedMax: number; // m/s (maximum)
  windDirection: number; // Degrees (average)
  humidity: number; // Percent (average)
  pressure: number; // hPa (average)
  description: string; // German description (most common)
  icon: string; // OpenWeatherMap icon code
  precipitationProbability: number; // 0-100%
  precipitationAmount: number; // mm
}

/**
 * Hourly forecast data structure
 */
export interface HourlyForecast {
  datetime: Date;
  temperature: number; // Celsius
  feelsLike: number; // Celsius
  humidity: number; // Percent
  pressure: number; // hPa
  windSpeed: number; // m/s
  windDirection: number; // Degrees
  windGust?: number; // m/s
  description: string; // German description
  icon: string; // OpenWeatherMap icon code
  cloudCover: number; // Percent
  precipitationProbability: number; // 0-100%
  precipitationAmount: number; // mm
}

/**
 * Weather statistics
 */
export interface WeatherStatistics {
  avgWindSpeed: number; // m/s
  maxWindSpeed: number; // m/s
  minWindSpeed: number; // m/s
  avgTemperature: number; // Celsius
  maxTemperature: number; // Celsius
  minTemperature: number; // Celsius
  avgHumidity: number; // Percent
  avgPressure: number; // hPa
  totalPrecipitation: number; // mm
  dataPoints: number;
  period: {
    from: Date;
    to: Date;
  };
}

// =============================================================================
// API Response Types
// =============================================================================

/**
 * Weather API response for a park
 */
export interface WeatherResponse {
  parkId: string;
  parkName: string;
  location: {
    lat: number;
    lon: number;
  };
  current: {
    temperature: number; // Celsius
    humidity: number; // Percent
    pressure: number; // hPa
    windSpeed: number; // m/s
    windDirection: number; // Degrees
    windGust?: number; // m/s
    description: string;
    icon: string;
    timestamp: string; // ISO string
  };
  forecast?: Array<{
    date: string; // ISO date string
    tempMin: number;
    tempMax: number;
    windSpeed: number;
    windSpeedMax: number;
    description: string;
    icon: string;
    precipitationProbability: number;
  }>;
  lastUpdated: string; // ISO string
  source: "cache" | "api" | "database";
}

/**
 * Historical weather data response
 */
export interface HistoricalWeatherResponse {
  parkId: string;
  parkName: string;
  data: Array<{
    id: string;
    recordedAt: string; // ISO string
    windSpeedMs: number | null;
    windDirectionDeg: number | null;
    temperatureC: number | null;
    humidityPercent: number | null;
    pressureHpa: number | null;
    weatherCondition: string | null;
  }>;
  statistics: WeatherStatistics | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  period: {
    from: string;
    to: string;
  };
}

// =============================================================================
// Cache Types
// =============================================================================

/**
 * Cached weather data structure
 */
export interface CachedWeatherData {
  parkId: string;
  current: CurrentWeather;
  forecast?: DailyForecast[];
  hourlyForecast?: HourlyForecast[];
  cachedAt: string; // ISO string
  expiresAt: string; // ISO string
}

// =============================================================================
// Error Types
// =============================================================================

/**
 * Weather API error
 */
export class WeatherApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly apiResponse?: unknown
  ) {
    super(message);
    this.name = "WeatherApiError";
  }
}

/**
 * Weather service error codes
 */
export enum WeatherErrorCode {
  API_RATE_LIMIT = "API_RATE_LIMIT",
  API_ERROR = "API_ERROR",
  PARK_NOT_FOUND = "PARK_NOT_FOUND",
  NO_COORDINATES = "NO_COORDINATES",
  CACHE_ERROR = "CACHE_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
}
