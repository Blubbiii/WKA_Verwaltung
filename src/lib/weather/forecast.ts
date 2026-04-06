/**
 * Wind forecast using Open-Meteo API (free, no API key).
 * https://open-meteo.com/en/docs
 *
 * Provides 7-day hourly wind forecasts for park locations.
 */

interface ForecastHour {
  time: string;           // ISO string
  windSpeedMs: number;    // 100m wind speed in m/s
  windDirection: number;  // degrees
  temperature: number;    // °C
  precipitation: number;  // mm
  cloudCover: number;     // %
}

interface ForecastDay {
  date: string;           // "2024-01-15"
  avgWindSpeed: number;
  maxWindSpeed: number;
  minWindSpeed: number;
  avgTemperature: number;
  precipitationSum: number;
  dominantWindDirection: number;
}

interface ForecastResponse {
  parkId: string;
  parkName: string;
  latitude: number;
  longitude: number;
  hourly: ForecastHour[];
  daily: ForecastDay[];
  estimatedProductionKwh: number | null; // rough estimate based on power curve
}

/**
 * Fetch 7-day wind forecast from Open-Meteo for a specific location.
 */
async function fetchOpenMeteoForecast(
  latitude: number,
  longitude: number
): Promise<{ hourly: ForecastHour[]; daily: ForecastDay[] }> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", latitude.toString());
  url.searchParams.set("longitude", longitude.toString());
  url.searchParams.set("hourly", "wind_speed_100m,wind_direction_100m,temperature_2m,precipitation,cloud_cover");
  url.searchParams.set("daily", "wind_speed_10m_max,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_direction_10m_dominant");
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("timezone", "Europe/Berlin");
  url.searchParams.set("forecast_days", "7");

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } }); // Cache 1 hour
  if (!res.ok) {
    throw new Error(`Open-Meteo API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  // Parse hourly
  const hourly: ForecastHour[] = [];
  const times = data.hourly?.time ?? [];
  for (let i = 0; i < times.length; i++) {
    hourly.push({
      time: times[i],
      windSpeedMs: data.hourly.wind_speed_100m?.[i] ?? 0,
      windDirection: data.hourly.wind_direction_100m?.[i] ?? 0,
      temperature: data.hourly.temperature_2m?.[i] ?? 0,
      precipitation: data.hourly.precipitation?.[i] ?? 0,
      cloudCover: data.hourly.cloud_cover?.[i] ?? 0,
    });
  }

  // Parse daily
  const daily: ForecastDay[] = [];
  const dailyTimes = data.daily?.time ?? [];
  for (let i = 0; i < dailyTimes.length; i++) {
    // Calculate daily avg/min/max wind from hourly data
    const dayStart = dailyTimes[i];
    const dayHourly = hourly.filter(h => h.time.startsWith(dayStart));
    const winds = dayHourly.map(h => h.windSpeedMs);
    const avgWind = winds.length > 0 ? winds.reduce((a, b) => a + b, 0) / winds.length : 0;
    const maxWind = winds.length > 0 ? Math.max(...winds) : 0;
    const minWind = winds.length > 0 ? Math.min(...winds) : 0;
    const avgTemp = dayHourly.length > 0
      ? dayHourly.reduce((a, h) => a + h.temperature, 0) / dayHourly.length
      : ((data.daily.temperature_2m_max?.[i] ?? 0) + (data.daily.temperature_2m_min?.[i] ?? 0)) / 2;

    daily.push({
      date: dayStart,
      avgWindSpeed: Math.round(avgWind * 10) / 10,
      maxWindSpeed: Math.round(maxWind * 10) / 10,
      minWindSpeed: Math.round(minWind * 10) / 10,
      avgTemperature: Math.round(avgTemp * 10) / 10,
      precipitationSum: data.daily.precipitation_sum?.[i] ?? 0,
      dominantWindDirection: data.daily.wind_direction_10m_dominant?.[i] ?? 0,
    });
  }

  return { hourly, daily };
}

/**
 * Estimate production from wind forecast using simplified power curve.
 * Assumes a generic 2MW turbine power curve (cut-in 3, rated 12, cut-out 25 m/s).
 */
function estimateProduction(
  hourlyWindSpeeds: number[],
  ratedPowerKw: number,
  turbineCount: number
): number {
  let totalKwh = 0;
  for (const ws of hourlyWindSpeeds) {
    let powerFraction = 0;
    if (ws >= 3 && ws < 12) {
      // Cubic region: P ∝ v³
      powerFraction = Math.pow((ws - 3) / 9, 3);
    } else if (ws >= 12 && ws <= 25) {
      powerFraction = 1.0; // Rated power
    }
    // else: below cut-in or above cut-out = 0

    totalKwh += (powerFraction * ratedPowerKw * turbineCount) / 1; // 1 hour per data point
  }
  return Math.round(totalKwh);
}

export async function getForecastForPark(
  parkId: string,
  parkName: string,
  latitude: number,
  longitude: number,
  ratedPowerKw: number,
  turbineCount: number
): Promise<ForecastResponse> {
  const { hourly, daily } = await fetchOpenMeteoForecast(latitude, longitude);

  const estimatedProductionKwh = ratedPowerKw > 0 && turbineCount > 0
    ? estimateProduction(
        hourly.map(h => h.windSpeedMs),
        ratedPowerKw,
        turbineCount
      )
    : null;

  return {
    parkId,
    parkName,
    latitude,
    longitude,
    hourly,
    daily,
    estimatedProductionKwh,
  };
}

export type { ForecastHour, ForecastDay, ForecastResponse };
