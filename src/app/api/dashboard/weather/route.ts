import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/withPermission";
import { apiLogger as logger } from "@/lib/logger";

// WMO weather code → condition mapping
function mapWeatherCode(code: number, windSpeedKmh: number): "sunny" | "cloudy" | "rainy" | "windy" {
  // Wind speed override takes highest priority
  if (windSpeedKmh > 30) return "windy";

  if (code === 0) return "sunny";

  const cloudyCodes = new Set([1, 2, 3, 45, 48]);
  if (cloudyCodes.has(code)) return "cloudy";

  const rainyCodes = new Set([
    51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77,
    80, 81, 82, 85, 86, 95, 96, 99,
  ]);
  if (rainyCodes.has(code)) return "rainy";

  // Unknown codes: default to cloudy
  return "cloudy";
}

interface OpenMeteoResponse {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    weather_code: number;
  };
}

export async function GET() {
  const check = await requireAuth();
  if (!check.authorized) return check.error;

  try {
    const parks = await prisma.park.findMany({
      where: { tenantId: check.tenantId, status: "ACTIVE" },
      select: { id: true, name: true, latitude: true, longitude: true },
    });

    // Only parks that have coordinates
    const parksWithCoords = parks.filter(
      (p) => p.latitude != null && p.longitude != null
    );

    const results = await Promise.allSettled(
      parksWithCoords.map(async (park) => {
        const lat = Number(park.latitude);
        const lng = Number(park.longitude);

        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${lat}&longitude=${lng}` +
          `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
          `&wind_speed_unit=kmh&timezone=auto`;

        const res = await fetch(url, { next: { revalidate: 900 } });
        if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);

        const data: OpenMeteoResponse = await res.json();
        const current = data.current;

        return {
          parkId: park.id,
          parkName: park.name,
          temperature: current.temperature_2m,
          windSpeed: current.wind_speed_10m,
          condition: mapWeatherCode(current.weather_code, current.wind_speed_10m),
          humidity: current.relative_humidity_2m,
        };
      })
    );

    type WeatherEntry = {
      parkId: string;
      parkName: string;
      temperature: number;
      windSpeed: number;
      condition: "sunny" | "cloudy" | "rainy" | "windy";
      humidity: number;
    };

    const weather = results
      .filter((r): r is PromiseFulfilledResult<WeatherEntry> => r.status === "fulfilled")
      .map((r) => r.value);

    return NextResponse.json(weather);
  } catch (error) {
    logger.error({ error }, "[weather] Error");
    return NextResponse.json({ error: "Interner Serverfehler" }, { status: 500 });
  }
}
