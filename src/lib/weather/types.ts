/**
 * Weather Integration Types
 *
 * TypeScript interfaces for weather data in WindparkManager
 * Supports OpenWeatherMap API and internal data structures
 */

// =============================================================================
// OpenWeatherMap API Response Types
// =============================================================================

/**
 * OpenWeatherMap Current Weather Response
 */
export interface OpenWeatherMapCurrentResponse {
  coord: {
    lon: number;
    lat: number;
  };
  weather: Array<{
    id: number;
    main: string;
    description: string;
    icon: string;
  }>;
  base: string;
  main: {
    temp: number; // Kelvin by default, Celsius with units=metric
    feels_like: number;
    temp_min: number;
    temp_max: number;
    pressure: number; // hPa
    humidity: number; // %
    sea_level?: number;
    grnd_level?: number;
  };
  visibility: number; // meters
  wind: {
    speed: number; // m/s
    deg: number; // degrees
    gust?: number; // m/s
  };
  clouds: {
    all: number; // %
  };
  rain?: {
    "1h"?: number; // mm
    "3h"?: number; // mm
  };
  snow?: {
    "1h"?: number; // mm
    "3h"?: number; // mm
  };
  dt: number; // Unix timestamp
  sys: {
    type?: number;
    id?: number;
    country: string;
    sunrise: number;
    sunset: number;
  };
  timezone: number; // Shift in seconds from UTC
  id: number; // City ID
  name: string; // City name
  cod: number; // HTTP response code
}

/**
 * OpenWeatherMap 5-Day Forecast Response
 */
export interface OpenWeatherMapForecastResponse {
  cod: string;
  message: number;
  cnt: number;
  list: Array<{
    dt: number;
    main: {
      temp: number;
      feels_like: number;
      temp_min: number;
      temp_max: number;
      pressure: number;
      sea_level: number;
      grnd_level: number;
      humidity: number;
      temp_kf: number;
    };
    weather: Array<{
      id: number;
      main: string;
      description: string;
      icon: string;
    }>;
    clouds: {
      all: number;
    };
    wind: {
      speed: number;
      deg: number;
      gust?: number;
    };
    visibility: number;
    pop: number; // Probability of precipitation (0-1)
    rain?: {
      "3h": number;
    };
    snow?: {
      "3h": number;
    };
    sys: {
      pod: string; // Part of day (n = night, d = day)
    };
    dt_txt: string; // Date/time in text format
  }>;
  city: {
    id: number;
    name: string;
    coord: {
      lat: number;
      lon: number;
    };
    country: string;
    population: number;
    timezone: number;
    sunrise: number;
    sunset: number;
  };
}

// =============================================================================
// Internal Weather Data Types
// =============================================================================

/**
 * Weather condition codes and descriptions (German)
 */
export const WEATHER_CONDITIONS: Record<string, string> = {
  // Thunderstorm
  "200": "Gewitter mit leichtem Regen",
  "201": "Gewitter mit Regen",
  "202": "Gewitter mit starkem Regen",
  "210": "Leichtes Gewitter",
  "211": "Gewitter",
  "212": "Starkes Gewitter",
  "221": "Unwetter",
  "230": "Gewitter mit leichtem Nieselregen",
  "231": "Gewitter mit Nieselregen",
  "232": "Gewitter mit starkem Nieselregen",
  // Drizzle
  "300": "Leichter Nieselregen",
  "301": "Nieselregen",
  "302": "Starker Nieselregen",
  "310": "Leichter Nieselregen",
  "311": "Nieselregen",
  "312": "Starker Nieselregen",
  "313": "Regenschauer und Nieselregen",
  "314": "Starker Regenschauer und Nieselregen",
  "321": "Nieselschauer",
  // Rain
  "500": "Leichter Regen",
  "501": "Maessiger Regen",
  "502": "Starker Regen",
  "503": "Sehr starker Regen",
  "504": "Extremer Regen",
  "511": "Gefrierender Regen",
  "520": "Leichte Regenschauer",
  "521": "Regenschauer",
  "522": "Starke Regenschauer",
  "531": "Vereinzelte Regenschauer",
  // Snow
  "600": "Leichter Schneefall",
  "601": "Schneefall",
  "602": "Starker Schneefall",
  "611": "Schneeregen",
  "612": "Leichter Schneeschauer",
  "613": "Schneeschauer",
  "615": "Leichter Regen und Schnee",
  "616": "Regen und Schnee",
  "620": "Leichte Schneeschauer",
  "621": "Schneeschauer",
  "622": "Starke Schneeschauer",
  // Atmosphere
  "701": "Dunst",
  "711": "Rauch",
  "721": "Dunst",
  "731": "Sand-/Staubwirbel",
  "741": "Nebel",
  "751": "Sand",
  "761": "Staub",
  "762": "Vulkanasche",
  "771": "Boeen",
  "781": "Tornado",
  // Clear
  "800": "Klarer Himmel",
  // Clouds
  "801": "Wenige Wolken",
  "802": "Aufgelockerte Bewoelkung",
  "803": "Bewoelkt",
  "804": "Bedeckt",
};

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
  API_KEY_MISSING = "API_KEY_MISSING",
  API_RATE_LIMIT = "API_RATE_LIMIT",
  API_ERROR = "API_ERROR",
  PARK_NOT_FOUND = "PARK_NOT_FOUND",
  NO_COORDINATES = "NO_COORDINATES",
  CACHE_ERROR = "CACHE_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
}
