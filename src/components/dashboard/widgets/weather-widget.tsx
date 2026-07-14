"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Cloud, Sun, CloudRain, Wind, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

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
  const t = useTranslations("dashboard.widgets");
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
        // FP6: kein Mock-Fallback — User wuerde sonst denken die Windpark-
        // Werte seien echt. Explizit Empty-State + Fehlermeldung.
        setWeatherData([]);
        setError(t("noWeatherData"));
      }
    } catch {
      setWeatherData([]);
      setError(t("noWeatherData"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchWeather();
    // Refresh every 15 minutes — skip when tab is hidden to save resources
    const interval = setInterval(() => {
      if (!document.hidden) fetchWeather();
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchWeather]);

  if (isLoading) {
    // FP2: Skeleton-Rows in Widget-Zielhoehe (statt Spinner) — verhindert
    // Layout-Shift und signalisiert die kommende Datenstruktur.
    return (
      <div className={cn("grid gap-4", className)}>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
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
          <p className="text-sm">{t("noWeatherData")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("grid gap-4", className)}>
      {weatherData.map((park) => (
        <div
          key={park.parkId}
          className="flex items-center justify-between p-3 @md:p-4 bg-muted/50 rounded-lg"
        >
          <div className="flex items-center gap-3 @md:gap-4">
            {/* Weather icon scales on wider widgets */}
            <span className="[&>svg]:h-6 [&>svg]:w-6 @md:[&>svg]:h-8 @md:[&>svg]:w-8">
              {getWeatherIcon(park.condition)}
            </span>
            <div>
              <p className="font-medium text-sm @md:text-base">{park.parkName}</p>
              <p className="text-xs @md:text-sm text-muted-foreground">
                {getConditionLabel(park.condition)}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-semibold @md:text-lg">{park.temperature}°C</p>
            <p className="text-xs @md:text-sm text-muted-foreground flex items-center justify-end gap-1">
              <Wind className="h-3 w-3" />
              {park.windSpeed} km/h
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
