"use client";

import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import { format, subDays } from "date-fns";
import { de } from "date-fns/locale";
import {
  ArrowLeft,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudSun,
  Compass,
  Droplets,
  Gauge,
  RefreshCw,
  Sun,
  Thermometer,
  Wind,
  AlertCircle,
  Loader2,
  Calendar,
  TrendingUp,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { WeatherChart } from "@/components/parks/weather-chart-dynamic";

// =============================================================================
// Types
// =============================================================================

interface WeatherData {
  parkId: string;
  parkName: string;
  location: { lat: number; lon: number };
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
  forecast?: Array<{
    date: string;
    tempMin: number;
    tempMax: number;
    windSpeed: number;
    windSpeedMax: number;
    description: string;
    icon: string;
    precipitationProbability: number;
  }>;
  lastUpdated: string;
  source: "cache" | "api" | "database";
}

interface HistoricalData {
  parkId: string;
  parkName: string;
  data: Array<{
    id: string;
    recordedAt: string;
    windSpeedMs: number | null;
    windDirectionDeg: number | null;
    temperatureC: number | null;
    humidityPercent: number | null;
    pressureHpa: number | null;
    weatherCondition: string | null;
  }>;
  statistics: {
    avgWindSpeed: number;
    maxWindSpeed: number;
    minWindSpeed: number;
    avgTemperature: number;
    maxTemperature: number;
    minTemperature: number;
    avgHumidity: number;
    avgPressure: number;
    dataPoints: number;
  } | null;
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
// Helper Functions
// =============================================================================

function getWeatherIcon(icon: string) {
  // Map OpenWeatherMap icon codes to Lucide icons
  if (icon.startsWith("01")) return <Sun className="h-8 w-8 text-yellow-500" />;
  if (icon.startsWith("02"))
    return <CloudSun className="h-8 w-8 text-gray-400" />;
  if (icon.startsWith("03") || icon.startsWith("04"))
    return <Cloud className="h-8 w-8 text-gray-500" />;
  if (icon.startsWith("09") || icon.startsWith("10"))
    return <CloudRain className="h-8 w-8 text-blue-500" />;
  if (icon.startsWith("11"))
    return <CloudRain className="h-8 w-8 text-purple-500" />;
  if (icon.startsWith("13"))
    return <CloudSnow className="h-8 w-8 text-blue-200" />;
  return <Cloud className="h-8 w-8 text-gray-400" />;
}

function getWindDirectionLabel(degrees: number): string {
  const directions = [
    "N",
    "NNO",
    "NO",
    "ONO",
    "O",
    "OSO",
    "SO",
    "SSO",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  const index = Math.round(degrees / 22.5) % 16;
  return directions[index];
}

function formatWindSpeed(ms: number): string {
  return `${ms.toFixed(1)} m/s`;
}

function formatWindSpeedKmh(ms: number): string {
  return `${(ms * 3.6).toFixed(1)} km/h`;
}

// =============================================================================
// Component
// =============================================================================

export default function ParkWeatherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: parkId } = use(params);

  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [historical, setHistorical] = useState<HistoricalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyPeriod, setHistoryPeriod] = useState<"7d" | "30d" | "90d">("7d");

  // Fetch current weather
  const fetchWeather = useCallback(
    async (forceRefresh = false) => {
      try {
        if (forceRefresh) setRefreshing(true);
        const response = await fetch(
          `/api/weather/${parkId}?forecast=true${forceRefresh ? "&refresh=true" : ""}`
        );
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Fehler beim Laden");
        }
        const data = await response.json();
        setWeather(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler beim Laden");
      } finally {
        setRefreshing(false);
      }
    },
    [parkId]
  );

  // Fetch historical data
  const fetchHistorical = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/weather/${parkId}/history?period=${historyPeriod}&limit=500`
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Fehler beim Laden");
      }
      const data = await response.json();
      setHistorical(data);
    } catch {
    }
  }, [parkId, historyPeriod]);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchWeather(), fetchHistorical()]);
      setLoading(false);
    };
    loadData();
  }, [fetchWeather, fetchHistorical]);

  // Refetch historical when period changes
  useEffect(() => {
    if (!loading) {
      fetchHistorical();
    }
  }, [historyPeriod, fetchHistorical, loading]);

  // Auto-refresh every 30 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      fetchWeather();
    }, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchWeather]);

  // Handle manual refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchWeather(true);
    await fetchHistorical();
    toast.success("Wetterdaten aktualisiert");
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="mt-2 h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/parks/${parkId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Wetterdaten</h1>
        </div>

        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4 text-center">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <p className="text-lg font-medium">{error}</p>
              <p className="text-sm text-muted-foreground">
                Bitte stellen Sie sicher, dass der Park Koordinaten hat und der
                API-Schluessel konfiguriert ist.
              </p>
              <Button onClick={() => fetchWeather()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Erneut versuchen
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/parks/${parkId}`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Wetter: {weather.parkName}
            </h1>
            <p className="text-sm text-muted-foreground">
              Koordinaten: {weather.location.lat.toFixed(4)},{" "}
              {weather.location.lon.toFixed(4)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {weather.source === "cache"
              ? "Aus Cache"
              : weather.source === "api"
                ? "Live"
                : "Datenbank"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Aktualisieren
          </Button>
        </div>
      </div>

      {/* Current Weather */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Temperatur</CardTitle>
            <Thermometer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {weather.current.temperature.toFixed(1)}C
            </div>
            <p className="text-xs text-muted-foreground">
              {weather.current.description}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-primary/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Windgeschwindigkeit
            </CardTitle>
            <Wind className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {formatWindSpeed(weather.current.windSpeed)}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatWindSpeedKmh(weather.current.windSpeed)} |{" "}
              {weather.current.windGust
                ? `Boeen: ${formatWindSpeed(weather.current.windGust)}`
                : "Keine Boeen"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Windrichtung</CardTitle>
            <Compass className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {getWindDirectionLabel(weather.current.windDirection)}
            </div>
            <p className="text-xs text-muted-foreground">
              {weather.current.windDirection}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Luftfeuchtigkeit</CardTitle>
            <Droplets className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{weather.current.humidity}%</div>
            <p className="text-xs text-muted-foreground">
              Luftdruck: {weather.current.pressure} hPa
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Uebersicht</TabsTrigger>
          <TabsTrigger value="forecast">5-Tage Vorhersage</TabsTrigger>
          <TabsTrigger value="history">Historische Daten</TabsTrigger>
          <TabsTrigger value="statistics">Statistiken</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Current Conditions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {getWeatherIcon(weather.current.icon)}
                  Aktuelle Bedingungen
                </CardTitle>
                <CardDescription>
                  Stand:{" "}
                  {format(new Date(weather.current.timestamp), "dd.MM.yyyy HH:mm", {
                    locale: de,
                  })}{" "}
                  Uhr
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Wetter</span>
                    <span className="font-medium">
                      {weather.current.description}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Temperatur</span>
                    <span className="font-medium">
                      {weather.current.temperature.toFixed(1)}C
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Wind</span>
                    <span className="font-medium">
                      {formatWindSpeed(weather.current.windSpeed)} aus{" "}
                      {getWindDirectionLabel(weather.current.windDirection)}
                    </span>
                  </div>
                  {weather.current.windGust && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Windboeen</span>
                      <span className="font-medium">
                        {formatWindSpeed(weather.current.windGust)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Luftfeuchtigkeit</span>
                    <span className="font-medium">{weather.current.humidity}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Luftdruck</span>
                    <span className="font-medium">
                      {weather.current.pressure} hPa
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Wind Statistics */}
            {historical?.statistics && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Wind-Statistiken (7 Tage)
                  </CardTitle>
                  <CardDescription>
                    Basierend auf {historical.statistics.dataPoints} Datenpunkten
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Durchschnitt
                      </span>
                      <span className="font-medium">
                        {formatWindSpeed(historical.statistics.avgWindSpeed)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Maximum</span>
                      <span className="font-medium text-green-600">
                        {formatWindSpeed(historical.statistics.maxWindSpeed)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Minimum</span>
                      <span className="font-medium text-orange-600">
                        {formatWindSpeed(historical.statistics.minWindSpeed)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Temperatur</span>
                      <span className="font-medium">
                        {historical.statistics.avgTemperature.toFixed(1)}C
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Luftfeuchtigkeit
                      </span>
                      <span className="font-medium">
                        {historical.statistics.avgHumidity}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Forecast Tab */}
        <TabsContent value="forecast">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                5-Tage Vorhersage
              </CardTitle>
              <CardDescription>
                Wettervorhersage fuer die naechsten 5 Tage
              </CardDescription>
            </CardHeader>
            <CardContent>
              {weather.forecast && weather.forecast.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-5">
                  {weather.forecast.map((day) => (
                    <div
                      key={day.date}
                      className="rounded-lg border p-4 text-center"
                    >
                      <p className="text-sm font-medium">
                        {format(new Date(day.date), "EEE, dd.MM.", {
                          locale: de,
                        })}
                      </p>
                      <div className="my-3 flex justify-center">
                        {getWeatherIcon(day.icon)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {day.description}
                      </p>
                      <div className="mt-2 space-y-1">
                        <p className="text-sm">
                          <span className="text-blue-600">{day.tempMin}C</span>
                          {" / "}
                          <span className="text-red-600">{day.tempMax}C</span>
                        </p>
                        <p className="text-sm font-medium text-primary">
                          <Wind className="mr-1 inline h-3 w-3" />
                          {formatWindSpeed(day.windSpeed)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Max: {formatWindSpeed(day.windSpeedMax)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <Droplets className="mr-1 inline h-3 w-3" />
                          {day.precipitationProbability}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-muted-foreground">
                  Keine Vorhersage verfuegbar
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Windgeschwindigkeit
                </CardTitle>
                <CardDescription>
                  Verlauf der Windgeschwindigkeit
                </CardDescription>
              </div>
              <Select
                value={historyPeriod}
                onValueChange={(value) =>
                  setHistoryPeriod(value as "7d" | "30d" | "90d")
                }
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">7 Tage</SelectItem>
                  <SelectItem value="30d">30 Tage</SelectItem>
                  <SelectItem value="90d">90 Tage</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              {historical && historical.data.length > 0 ? (
                <WeatherChart
                  data={historical.data}
                  period={historyPeriod}
                  dataKey="windSpeedMs"
                  label="Windgeschwindigkeit (m/s)"
                  color="#3b82f6"
                />
              ) : (
                <p className="py-8 text-center text-muted-foreground">
                  Keine historischen Daten verfuegbar
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Statistics Tab */}
        <TabsContent value="statistics">
          <div className="grid gap-6 md:grid-cols-2">
            {historical?.statistics ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Wind className="h-5 w-5" />
                      Wind-Statistiken
                    </CardTitle>
                    <CardDescription>
                      Zeitraum: {historyPeriod === "7d" ? "7 Tage" : historyPeriod === "30d" ? "30 Tage" : "90 Tage"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            Durchschnitt
                          </span>
                          <span className="font-medium">
                            {formatWindSpeed(historical.statistics.avgWindSpeed)}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{
                              width: `${Math.min(100, (historical.statistics.avgWindSpeed / 20) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Maximum</span>
                          <span className="font-medium">
                            {formatWindSpeed(historical.statistics.maxWindSpeed)}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-green-500"
                            style={{
                              width: `${Math.min(100, (historical.statistics.maxWindSpeed / 30) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Minimum</span>
                          <span className="font-medium">
                            {formatWindSpeed(historical.statistics.minWindSpeed)}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-orange-500"
                            style={{
                              width: `${Math.min(100, (historical.statistics.minWindSpeed / 20) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Thermometer className="h-5 w-5" />
                      Temperatur-Statistiken
                    </CardTitle>
                    <CardDescription>
                      Basierend auf {historical.statistics.dataPoints} Datenpunkten
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            Durchschnitt
                          </span>
                          <span className="font-medium">
                            {historical.statistics.avgTemperature.toFixed(1)}C
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{
                              width: `${Math.min(100, ((historical.statistics.avgTemperature + 10) / 40) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Maximum</span>
                          <span className="font-medium">
                            {historical.statistics.maxTemperature.toFixed(1)}C
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-red-500"
                            style={{
                              width: `${Math.min(100, ((historical.statistics.maxTemperature + 10) / 50) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Minimum</span>
                          <span className="font-medium">
                            {historical.statistics.minTemperature.toFixed(1)}C
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-blue-500"
                            style={{
                              width: `${Math.min(100, ((historical.statistics.minTemperature + 20) / 50) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="md:col-span-2">
                <CardContent className="py-12">
                  <p className="text-center text-muted-foreground">
                    Keine Statistiken verfuegbar
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Last Updated */}
      <p className="text-center text-xs text-muted-foreground">
        Letzte Aktualisierung:{" "}
        {format(new Date(weather.lastUpdated), "dd.MM.yyyy HH:mm:ss", {
          locale: de,
        })}{" "}
        Uhr
      </p>
    </div>
  );
}
