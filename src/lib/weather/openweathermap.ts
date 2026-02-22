import { logger } from "@/lib/logger";
/**
 * OpenWeatherMap API Client
 *
 * Handles all API calls to OpenWeatherMap service
 * Includes rate limiting, retry logic, and error handling
 */

import {
  OpenWeatherMapCurrentResponse,
  OpenWeatherMapForecastResponse,
  CurrentWeather,
  DailyForecast,
  HourlyForecast,
  WEATHER_CONDITIONS,
  getWindDirectionLabel,
  WeatherApiError,
  WeatherErrorCode,
} from "./types";

// =============================================================================
// Configuration
// =============================================================================

const OPENWEATHERMAP_API_BASE = "https://api.openweathermap.org/data/2.5";

/**
 * Rate limiter for OpenWeatherMap API
 * Free tier: 60 calls/minute, 1,000,000 calls/month
 */
class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 60, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now();

    // Remove expired timestamps
    this.requests = this.requests.filter((time) => now - time < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      // Calculate wait time
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (now - oldestRequest) + 100; // +100ms buffer

      logger.info(
        `[OpenWeatherMap] Rate limit reached, waiting ${waitTime}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // Recursive call to check again
      return this.waitForSlot();
    }

    this.requests.push(now);
  }

  getRequestsInWindow(): number {
    const now = Date.now();
    this.requests = this.requests.filter((time) => now - time < this.windowMs);
    return this.requests.length;
  }
}

// Global rate limiter instance
const rateLimiter = new RateLimiter(
  parseInt(process.env.WEATHER_RATE_LIMIT || "60"),
  60000
);

// =============================================================================
// API Client
// =============================================================================

/**
 * Get API key from environment
 */
function getApiKey(): string | null {
  return process.env.OPENWEATHERMAP_API_KEY || null;
}

/**
 * Check if API is configured
 */
export function isWeatherApiConfigured(): boolean {
  return !!getApiKey();
}

/**
 * Generic fetch with retry logic
 */
async function fetchWithRetry<T>(
  url: string,
  options: {
    maxRetries?: number;
    retryDelay?: number;
  } = {}
): Promise<T> {
  const { maxRetries = 3, retryDelay = 1000 } = options;

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new WeatherApiError(
      "OpenWeatherMap API-Schluessel nicht konfiguriert",
      undefined,
      { code: WeatherErrorCode.API_KEY_MISSING }
    );
  }

  // Wait for rate limit slot
  await rateLimiter.waitForSlot();

  // Add API key to URL
  const separator = url.includes("?") ? "&" : "?";
  const fullUrl = `${url}${separator}appid=${apiKey}&units=metric&lang=de`;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(fullUrl, {
        headers: {
          Accept: "application/json",
        },
        // Timeout after 10 seconds
        signal: AbortSignal.timeout(10000),
      });

      if (response.status === 429) {
        // Rate limit exceeded
        const retryAfter = parseInt(
          response.headers.get("Retry-After") || "60"
        );
        logger.warn(
          `[OpenWeatherMap] Rate limit exceeded, retry after ${retryAfter}s`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, retryAfter * 1000)
        );
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new WeatherApiError(
          `OpenWeatherMap API Fehler: ${response.statusText}`,
          response.status,
          errorBody
        );
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (error instanceof WeatherApiError) {
        throw error; // Don't retry API errors
      }

      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
        logger.warn(
          { err: lastError.message },
          `[OpenWeatherMap] Request failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new WeatherApiError(
    `OpenWeatherMap API nicht erreichbar nach ${maxRetries} Versuchen`,
    undefined,
    lastError
  );
}

// =============================================================================
// Data Transformation
// =============================================================================

/**
 * Transform OpenWeatherMap current weather to internal format
 */
function transformCurrentWeather(
  data: OpenWeatherMapCurrentResponse
): CurrentWeather {
  const weatherId = data.weather[0]?.id?.toString() || "800";
  const description =
    WEATHER_CONDITIONS[weatherId] ||
    data.weather[0]?.description ||
    "Unbekannt";

  return {
    temperature: data.main.temp,
    feelsLike: data.main.feels_like,
    humidity: data.main.humidity,
    pressure: data.main.pressure,
    windSpeed: data.wind.speed,
    windDirection: data.wind.deg,
    windDirectionLabel: getWindDirectionLabel(data.wind.deg),
    windGust: data.wind.gust,
    description,
    icon: data.weather[0]?.icon || "01d",
    cloudCover: data.clouds.all,
    visibility: data.visibility,
    sunrise: new Date(data.sys.sunrise * 1000),
    sunset: new Date(data.sys.sunset * 1000),
    timestamp: new Date(data.dt * 1000),
  };
}

/**
 * Transform OpenWeatherMap forecast to daily format
 * Groups 3-hour forecasts into daily summaries
 */
function transformForecastToDaily(
  data: OpenWeatherMapForecastResponse
): DailyForecast[] {
  // Group forecast items by date
  const dailyData = new Map<
    string,
    {
      temps: number[];
      windSpeeds: number[];
      windDirections: number[];
      humidities: number[];
      pressures: number[];
      descriptions: string[];
      icons: string[];
      precipProbabilities: number[];
      precipAmounts: number[];
    }
  >();

  for (const item of data.list) {
    const date = item.dt_txt.split(" ")[0]; // YYYY-MM-DD

    if (!dailyData.has(date)) {
      dailyData.set(date, {
        temps: [],
        windSpeeds: [],
        windDirections: [],
        humidities: [],
        pressures: [],
        descriptions: [],
        icons: [],
        precipProbabilities: [],
        precipAmounts: [],
      });
    }

    const day = dailyData.get(date)!;
    day.temps.push(item.main.temp);
    day.windSpeeds.push(item.wind.speed);
    day.windDirections.push(item.wind.deg);
    day.humidities.push(item.main.humidity);
    day.pressures.push(item.main.pressure);

    const weatherId = item.weather[0]?.id?.toString() || "800";
    day.descriptions.push(
      WEATHER_CONDITIONS[weatherId] || item.weather[0]?.description || ""
    );
    day.icons.push(item.weather[0]?.icon || "01d");
    day.precipProbabilities.push(item.pop * 100);
    day.precipAmounts.push(
      (item.rain?.["3h"] || 0) + (item.snow?.["3h"] || 0)
    );
  }

  // Transform to DailyForecast array
  const forecasts: DailyForecast[] = [];

  for (const [date, day] of dailyData) {
    const avg = (arr: number[]) =>
      arr.reduce((a, b) => a + b, 0) / arr.length;
    const max = (arr: number[]) => Math.max(...arr);
    const min = (arr: number[]) => Math.min(...arr);

    // Find most common description
    const descriptionCounts = new Map<string, number>();
    for (const desc of day.descriptions) {
      descriptionCounts.set(desc, (descriptionCounts.get(desc) || 0) + 1);
    }
    let mostCommonDescription = "";
    let maxCount = 0;
    for (const [desc, count] of descriptionCounts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonDescription = desc;
      }
    }

    // Get midday icon (12:00) or first available
    const middayIndex = Math.floor(day.icons.length / 2);
    const icon = day.icons[middayIndex] || day.icons[0] || "01d";

    forecasts.push({
      date,
      tempMin: Math.round(min(day.temps) * 10) / 10,
      tempMax: Math.round(max(day.temps) * 10) / 10,
      tempDay: Math.round(avg(day.temps) * 10) / 10,
      windSpeed: Math.round(avg(day.windSpeeds) * 10) / 10,
      windSpeedMax: Math.round(max(day.windSpeeds) * 10) / 10,
      windDirection: Math.round(avg(day.windDirections)),
      humidity: Math.round(avg(day.humidities)),
      pressure: Math.round(avg(day.pressures)),
      description: mostCommonDescription,
      icon,
      precipitationProbability: Math.round(max(day.precipProbabilities)),
      precipitationAmount:
        Math.round(day.precipAmounts.reduce((a, b) => a + b, 0) * 10) / 10,
    });
  }

  return forecasts;
}

/**
 * Transform OpenWeatherMap forecast to hourly format
 */
function transformForecastToHourly(
  data: OpenWeatherMapForecastResponse
): HourlyForecast[] {
  return data.list.map((item) => {
    const weatherId = item.weather[0]?.id?.toString() || "800";
    const description =
      WEATHER_CONDITIONS[weatherId] ||
      item.weather[0]?.description ||
      "Unbekannt";

    return {
      datetime: new Date(item.dt * 1000),
      temperature: item.main.temp,
      feelsLike: item.main.feels_like,
      humidity: item.main.humidity,
      pressure: item.main.pressure,
      windSpeed: item.wind.speed,
      windDirection: item.wind.deg,
      windGust: item.wind.gust,
      description,
      icon: item.weather[0]?.icon || "01d",
      cloudCover: item.clouds.all,
      precipitationProbability: Math.round(item.pop * 100),
      precipitationAmount:
        (item.rain?.["3h"] || 0) + (item.snow?.["3h"] || 0),
    };
  });
}

// =============================================================================
// Public API Functions
// =============================================================================

/**
 * Get current weather for coordinates
 */
export async function getCurrentWeather(
  lat: number,
  lon: number
): Promise<CurrentWeather> {
  logger.info(
    `[OpenWeatherMap] Fetching current weather for ${lat}, ${lon}`
  );

  const url = `${OPENWEATHERMAP_API_BASE}/weather?lat=${lat}&lon=${lon}`;
  const data = await fetchWithRetry<OpenWeatherMapCurrentResponse>(url);

  return transformCurrentWeather(data);
}

/**
 * Get weather forecast for coordinates
 * OpenWeatherMap free tier provides 5-day forecast with 3-hour steps
 */
export async function getForecast(
  lat: number,
  lon: number,
  days: number = 5
): Promise<{
  daily: DailyForecast[];
  hourly: HourlyForecast[];
}> {
  logger.info(
    `[OpenWeatherMap] Fetching ${days}-day forecast for ${lat}, ${lon}`
  );

  const url = `${OPENWEATHERMAP_API_BASE}/forecast?lat=${lat}&lon=${lon}`;
  const data = await fetchWithRetry<OpenWeatherMapForecastResponse>(url);

  const daily = transformForecastToDaily(data);
  const hourly = transformForecastToHourly(data);

  // Limit to requested days
  const limitedDaily = daily.slice(0, days);

  return {
    daily: limitedDaily,
    hourly,
  };
}

/**
 * Get current weather and forecast in one call
 * More efficient than separate calls
 */
export async function getWeatherWithForecast(
  lat: number,
  lon: number,
  forecastDays: number = 5
): Promise<{
  current: CurrentWeather;
  forecast: DailyForecast[];
  hourlyForecast: HourlyForecast[];
}> {
  // Fetch both in parallel
  const [current, { daily, hourly }] = await Promise.all([
    getCurrentWeather(lat, lon),
    getForecast(lat, lon, forecastDays),
  ]);

  return {
    current,
    forecast: daily,
    hourlyForecast: hourly,
  };
}

/**
 * Get historical weather data (requires paid API plan)
 * Note: This is a placeholder - historical API requires One Call API 3.0 subscription
 */
export async function getHistoricalWeather(
  lat: number,
  lon: number,
  date: Date
): Promise<CurrentWeather | null> {
  // Historical data requires One Call API 3.0 which is a paid service
  // For now, we return null and rely on stored database data
  logger.warn(
    "[OpenWeatherMap] Historical data API requires paid subscription, using database instead"
  );
  return null;
}

/**
 * Get API rate limit status
 */
export function getRateLimitStatus(): {
  requestsInWindow: number;
  maxRequests: number;
  windowMs: number;
} {
  return {
    requestsInWindow: rateLimiter.getRequestsInWindow(),
    maxRequests: parseInt(process.env.WEATHER_RATE_LIMIT || "60"),
    windowMs: 60000,
  };
}

/**
 * Test API connection
 */
export async function testApiConnection(): Promise<{
  success: boolean;
  message: string;
  latency?: number;
}> {
  if (!isWeatherApiConfigured()) {
    return {
      success: false,
      message: "API-Schluessel nicht konfiguriert",
    };
  }

  try {
    const startTime = Date.now();
    // Test with Berlin coordinates
    await getCurrentWeather(52.52, 13.405);
    const latency = Date.now() - startTime;

    return {
      success: true,
      message: "Verbindung erfolgreich",
      latency,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler",
    };
  }
}
