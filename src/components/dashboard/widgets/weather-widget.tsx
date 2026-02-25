"use client";

import { useState, useEffect, useCallback } from "react";
import { Cloud, Sun, CloudRain, Wind, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================================================
// TYPES
// =============================================================================

interface WeatherData {
  parkId: string;
  parkName: string;
  temperature: number;
  windSpeed: number;
  condition: "sunny" | "cloudy" | "rainy" | "windy";
  humidity: number;
}

interface WeatherWidgetProps {
  className?: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getWeatherIcon(condition: WeatherData["condition"]) {
  switch (condition) {
    case "sunny":
      return <Sun className="h-6 w-6 text-yellow-500" />;
    case "cloudy":
      return <Cloud className="h-6 w-6 text-gray-400" />;
    case "rainy":
      return <CloudRain className="h-6 w-6 text-blue-500" />;
    case "windy":
      return <Wind className="h-6 w-6 text-blue-500" />;
    default:
      return <Cloud className="h-6 w-6 text-gray-400" />;
  }
}

function getConditionLabel(condition: WeatherData["condition"]) {
  switch (condition) {
    case "sunny":
      return "Sonnig";
    case "cloudy":
      return "Bewoelkt";
    case "rainy":
      return "Regnerisch";
    case "windy":
      return "Windig";
    default:
      return "Unbekannt";
  }
}

// =============================================================================
// WEATHER WIDGET
// =============================================================================

export function WeatherWidget({ className }: WeatherWidgetProps) {
  const [weatherData, setWeatherData] = useState<WeatherData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWeather = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/dashboard/weather");

      if (response.ok) {
        const data = await response.json();
        setWeatherData(data);
      } else {
        // Use mock data if API is not available
        setWeatherData([
          {
            parkId: "1",
            parkName: "Windpark Nord",
            temperature: 8,
            windSpeed: 24,
            condition: "windy",
            humidity: 65,
          },
          {
            parkId: "2",
            parkName: "Windpark Sued",
            temperature: 12,
            windSpeed: 18,
            condition: "cloudy",
            humidity: 72,
          },
        ]);
      }
    } catch {
      // Use mock data on error
      setWeatherData([
        {
          parkId: "1",
          parkName: "Windpark Nord",
          temperature: 8,
          windSpeed: 24,
          condition: "windy",
          humidity: 65,
        },
        {
          parkId: "2",
          parkName: "Windpark Sued",
          temperature: 12,
          windSpeed: 18,
          condition: "cloudy",
          humidity: 72,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWeather();
    // Refresh every 15 minutes
    const interval = setInterval(fetchWeather, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchWeather]);

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-center text-muted-foreground">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (weatherData.length === 0) {
    return (
      <div className={cn("flex items-center justify-center h-full", className)}>
        <div className="text-center text-muted-foreground">
          <Cloud className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">Keine Wetterdaten verfügbar</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("grid gap-4", className)}>
      {weatherData.map((park) => (
        <div
          key={park.parkId}
          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
        >
          <div className="flex items-center gap-3">
            {getWeatherIcon(park.condition)}
            <div>
              <p className="font-medium text-sm">{park.parkName}</p>
              <p className="text-xs text-muted-foreground">
                {getConditionLabel(park.condition)}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold">{park.temperature}°C</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Wind className="h-3 w-3" />
              {park.windSpeed} km/h
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
