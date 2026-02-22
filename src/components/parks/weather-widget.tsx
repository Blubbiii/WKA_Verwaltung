"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Cloud,
  CloudRain,
  CloudSnow,
  CloudSun,
  Compass,
  Loader2,
  RefreshCw,
  Sun,
  Thermometer,
  Wind,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// =============================================================================
// Types
// =============================================================================

interface WeatherData {
  parkId: string;
  parkName: string;
  current: {
    temperature: number;
    humidity: number;
    pressure: number;
    windSpeed: number;
    windDirection: number;
    windGust?: number;
    description: string;
    icon: string;
    timestamp: string;
  };
  lastUpdated: string;
  source: "cache" | "api" | "database";
}

interface WeatherWidgetProps {
  parkId: string;
  className?: string;
  showRefresh?: boolean;
  showLink?: boolean;
  compact?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getWeatherIcon(icon: string, className: string = "h-6 w-6") {
  if (icon.startsWith("01"))
    return <Sun className={`${className} text-yellow-500`} />;
  if (icon.startsWith("02"))
    return <CloudSun className={`${className} text-gray-400`} />;
  if (icon.startsWith("03") || icon.startsWith("04"))
    return <Cloud className={`${className} text-gray-500`} />;
  if (icon.startsWith("09") || icon.startsWith("10"))
    return <CloudRain className={`${className} text-blue-500`} />;
  if (icon.startsWith("11"))
    return <CloudRain className={`${className} text-purple-500`} />;
  if (icon.startsWith("13"))
    return <CloudSnow className={`${className} text-blue-200`} />;
  return <Cloud className={`${className} text-gray-400`} />;
}

function getWindDirectionLabel(degrees: number): string {
  const directions = [
    "N", "NNO", "NO", "ONO", "O", "OSO", "SO", "SSO",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

// =============================================================================
// Component
// =============================================================================

export function WeatherWidget({
  parkId,
  className = "",
  showRefresh = true,
  showLink = true,
  compact = false,
}: WeatherWidgetProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWeather = useCallback(async (forceRefresh = false) => {
    try {
      if (forceRefresh) setRefreshing(true);
      const response = await fetch(
        `/api/weather/${parkId}?forecast=false${forceRefresh ? "&refresh=true" : ""}`
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Fehler beim Laden");
      }
      const data = await response.json();
      setWeather(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [parkId]);

  // Initial load
  useEffect(() => {
    fetchWeather();
  }, [fetchWeather]);

  // Auto-refresh every 30 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      fetchWeather();
    }, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchWeather]);

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !weather) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Wetter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error || "Nicht verfuegbar"}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (compact) {
    return (
      <TooltipProvider>
        <Card className={className}>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getWeatherIcon(weather.current.icon, "h-8 w-8")}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold">
                      {weather.current.temperature.toFixed(0)}C
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {weather.current.description}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <Tooltip>
                      <TooltipTrigger className="flex items-center gap-1">
                        <Wind className="h-3 w-3" />
                        {weather.current.windSpeed.toFixed(1)} m/s
                      </TooltipTrigger>
                      <TooltipContent>
                        Windgeschwindigkeit: {weather.current.windSpeed.toFixed(1)} m/s
                        {weather.current.windGust && (
                          <> (Boeen: {weather.current.windGust.toFixed(1)} m/s)</>
                        )}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger className="flex items-center gap-1">
                        <Compass className="h-3 w-3" />
                        {getWindDirectionLabel(weather.current.windDirection)}
                      </TooltipTrigger>
                      <TooltipContent>
                        Windrichtung: {weather.current.windDirection}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {showRefresh && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => fetchWeather(true)}
                    disabled={refreshing}
                  >
                    {refreshing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                  </Button>
                )}
                {showLink && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                    <Link href={`/parks/${parkId}/weather`}>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </TooltipProvider>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-sm font-medium">Wetter</CardTitle>
          <CardDescription className="text-xs">
            {format(new Date(weather.current.timestamp), "HH:mm", { locale: de })} Uhr
          </CardDescription>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="text-xs">
            {weather.source === "cache"
              ? "Cache"
              : weather.source === "api"
                ? "Live"
                : "DB"}
          </Badge>
          {showRefresh && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => fetchWeather(true)}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center">
            {getWeatherIcon(weather.current.icon, "h-12 w-12")}
            <span className="mt-1 text-xs text-muted-foreground">
              {weather.current.description}
            </span>
          </div>
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Thermometer className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">
                {weather.current.temperature.toFixed(0)}C
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Wind className="h-3 w-3" />
                <span>{weather.current.windSpeed.toFixed(1)} m/s</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Compass className="h-3 w-3" />
                <span>
                  {getWindDirectionLabel(weather.current.windDirection)} (
                  {weather.current.windDirection})
                </span>
              </div>
              {weather.current.windGust && (
                <div className="col-span-2 text-xs text-muted-foreground">
                  Boeen: {weather.current.windGust.toFixed(1)} m/s
                </div>
              )}
            </div>
          </div>
        </div>
        {showLink && (
          <div className="mt-3 border-t pt-2">
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
              <Link href={`/parks/${parkId}/weather`}>
                Anzeigen
                <ExternalLink className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
