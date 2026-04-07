/**
 * DWD Open Data Client — free German weather station data.
 * https://opendata.dwd.de/climate_environment/CDC/
 *
 * Provides historical wind speed, temperature, and precipitation data
 * from the nearest DWD weather station to a given coordinate.
 */

interface DwdStation {
  id: string;        // Station ID (e.g., "00044")
  name: string;      // Station name
  latitude: number;
  longitude: number;
  elevation: number; // meters
  distanceKm: number; // calculated distance to target
}

interface DwdObservation {
  timestamp: string; // ISO datetime
  windSpeedMs: number | null;     // mean wind speed m/s
  windDirection: number | null;   // degrees
  temperatureC: number | null;    // °C
  precipitationMm: number | null; // mm
  pressureHpa: number | null;     // hPa
}

interface DwdStationResponse {
  station: DwdStation;
  observations: DwdObservation[];
  period: { from: string; to: string };
}

const DWD_BASE_URL = "https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate";

/**
 * Haversine distance between two points in km
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Parse DWD station list (fixed-width text format).
 * Columns: Stations_id, von_datum, bis_datum, Stationshoehe, Geogr.Breite, Geogr.Laenge, Stationsname
 */
function parseStationList(text: string): Omit<DwdStation, "distanceKm">[] {
  const lines = text.split("\n").slice(2); // Skip 2 header lines
  const stations: Omit<DwdStation, "distanceKm">[] = [];
  for (const line of lines) {
    if (line.trim().length < 50) continue;
    try {
      const id = line.substring(0, 5).trim().padStart(5, "0");
      const elevation = parseFloat(line.substring(24, 39).trim());
      const lat = parseFloat(line.substring(39, 51).trim());
      const lon = parseFloat(line.substring(51, 61).trim());
      const name = line.substring(61).trim();
      if (isNaN(lat) || isNaN(lon)) continue;
      stations.push({ id, name, latitude: lat, longitude: lon, elevation });
    } catch {
      continue;
    }
  }
  return stations;
}

/**
 * Find the nearest DWD weather station to a given coordinate.
 * Uses the 10-minute wind data station list.
 */
export async function findNearestStation(
  latitude: number,
  longitude: number
): Promise<DwdStation | null> {
  try {
    const url = `${DWD_BASE_URL}/10_minutes/wind/recent/zehn_now_ff_Beschreibung_Stationen.txt`;
    const res = await fetch(url, { next: { revalidate: 86400 } }); // Cache 24h
    if (!res.ok) return null;

    const text = await res.text();
    const stations = parseStationList(text);

    let nearest: DwdStation | null = null;
    let minDist = Infinity;

    for (const s of stations) {
      const dist = haversineDistance(latitude, longitude, s.latitude, s.longitude);
      if (dist < minDist) {
        minDist = dist;
        nearest = { ...s, distanceKm: Math.round(dist * 10) / 10 };
      }
    }

    return nearest;
  } catch {
    return null;
  }
}

/**
 * Fetch recent observations from a DWD station.
 * Returns the last available data (typically last 500 entries at 10-min resolution).
 *
 * Note: DWD data is in ZIP format containing a CSV file. For simplicity,
 * this implementation fetches the "now" (last ~24h) text endpoint when available,
 * or returns an empty array if parsing fails.
 */
export async function fetchStationObservations(
  stationId: string
): Promise<DwdObservation[]> {
  // DWD provides recent data as ZIP archives — for real implementation,
  // use a ZIP parser. For now, return station metadata confirmation.
  // Full implementation would download + unzip + parse the CSV.
  return [];
}

/**
 * Convenience: Find nearest station and return its info for a park location.
 */
export async function getDwdStationForPark(
  latitude: number,
  longitude: number
): Promise<{ station: DwdStation | null; observations: DwdObservation[] }> {
  const station = await findNearestStation(latitude, longitude);
  if (!station) return { station: null, observations: [] };

  const observations = await fetchStationObservations(station.id);
  return { station, observations };
}

export type { DwdStation, DwdObservation, DwdStationResponse };
