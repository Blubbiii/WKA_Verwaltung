/**
 * Weather Module - Central Exports
 *
 * Public API for weather functionality in WindparkManager
 */

// Types
export type {
  OpenWeatherMapCurrentResponse,
  OpenWeatherMapForecastResponse,
  CurrentWeather,
  DailyForecast,
  HourlyForecast,
  WeatherStatistics,
  WeatherResponse,
  HistoricalWeatherResponse,
  CachedWeatherData,
} from "./types";

export {
  WEATHER_CONDITIONS,
  getWindDirectionLabel,
  getWindDirectionFullLabel,
  WeatherApiError,
  WeatherErrorCode,
} from "./types";

// OpenWeatherMap API Client
export {
  isWeatherApiConfigured,
  getCurrentWeather,
  getForecast,
  getWeatherWithForecast,
  getHistoricalWeather as getHistoricalWeatherFromApi,
  getRateLimitStatus,
  testApiConnection,
} from "./openweathermap";

// Cache Operations
export {
  getCachedWeather,
  setCachedWeather,
  invalidateParkCache,
  invalidateTenantCache,
  getCacheStats,
  isCacheAvailable,
  getCachedCurrentWeather,
  setCachedCurrentWeather,
  getCachedWeatherBulk,
  clearAllWeatherCaches,
  setLastSyncTime,
  getLastSyncTime,
} from "./cache";

// Weather Service (Main API)
export {
  getWeatherForPark,
  saveWeatherToDatabase,
  syncWeatherForAllParks,
  refreshWeatherForPark,
  getHistoricalWeather,
  getWeatherStatistics,
  getParkLastSyncTime,
  isWeatherSyncNeeded,
  getParksNeedingSync,
} from "./service";

// Scheduler
export {
  scheduleWeatherSyncForTenant,
  scheduleDailyWeatherSyncForTenant,
  removeScheduledSyncsForTenant,
  triggerImmediateSyncForTenant,
  scheduleWeatherSyncForPark,
  removeScheduledSyncForPark,
  getWeatherQueueStatus,
  getScheduledWeatherJobs,
  pauseWeatherQueue,
  resumeWeatherQueue,
  cleanWeatherQueue,
  initializeWeatherScheduling,
} from "./scheduler";
