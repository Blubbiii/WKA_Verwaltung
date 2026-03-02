"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Search, MapPin, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { Feature, Geometry } from "geojson";

// WFS service options (matches wfs-config.ts keys)
const WFS_SERVICE_OPTIONS = [
  { key: "NRW", label: "Nordrhein-Westfalen" },
  { key: "NIEDERSACHSEN", label: "Niedersachsen (INSPIRE)" },
];

interface MatchStats {
  total: number;
  active: number;
  expiring: number;
  expired: number;
  draft: number;
  unmatched: number;
}

interface WfsLookupPanelProps {
  parkId: string;
  /** Called with fetched features (before matching) */
  onFeaturesLoaded: (features: Feature<Geometry>[]) => void;
  /** Called with matched features (after matching) */
  onFeaturesMatched: (features: Feature<Geometry>[], stats: MatchStats) => void;
  /** Initial Gemarkung suggestion from park plots */
  defaultCadastralDistrict?: string;
  /** Initial Flur suggestion */
  defaultFieldNumber?: string;
}

export function WfsLookupPanel({
  parkId,
  onFeaturesLoaded,
  onFeaturesMatched,
  defaultCadastralDistrict = "",
  defaultFieldNumber = "",
}: WfsLookupPanelProps) {
  const [service, setService] = useState("NRW");
  const [cadastralDistrict, setCadastralDistrict] = useState(defaultCadastralDistrict);
  const [fieldNumber, setFieldNumber] = useState(defaultFieldNumber);
  const [isLoading, setIsLoading] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [featureCount, setFeatureCount] = useState<number | null>(null);
  const [matchStats, setMatchStats] = useState<MatchStats | null>(null);
  const [rawFeatures, setRawFeatures] = useState<Feature<Geometry>[]>([]);

  const handleSearch = useCallback(async () => {
    if (!cadastralDistrict.trim()) {
      toast.error("Bitte Gemarkung eingeben");
      return;
    }

    setIsLoading(true);
    setFeatureCount(null);
    setMatchStats(null);
    setRawFeatures([]);

    try {
      const params = new URLSearchParams({
        service,
        cadastralDistrict: cadastralDistrict.trim(),
      });
      if (fieldNumber.trim()) {
        params.set("fieldNumber", fieldNumber.trim());
      }

      const res = await fetch(`/api/wfs/parcels?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.details || err.error || "WFS-Abfrage fehlgeschlagen");
      }

      const data = await res.json();
      const features = data.features ?? [];

      setFeatureCount(features.length);
      setRawFeatures(features);
      onFeaturesLoaded(features);

      if (features.length === 0) {
        toast.info("Keine Flurstücke gefunden");
      } else {
        toast.success(`${features.length} Flurstück(e) geladen`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler bei der Katasterabfrage");
    } finally {
      setIsLoading(false);
    }
  }, [service, cadastralDistrict, fieldNumber, onFeaturesLoaded]);

  const handleMatch = useCallback(async () => {
    if (rawFeatures.length === 0) {
      toast.error("Zuerst Flurstücke laden");
      return;
    }

    setIsMatching(true);
    try {
      const res = await fetch("/api/wfs/parcels/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parkId, features: rawFeatures }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.details || err.error || "Abgleich fehlgeschlagen");
      }

      const data = await res.json();
      const matched = data.features ?? [];
      const stats: MatchStats = data.stats ?? {
        total: matched.length,
        active: 0,
        expiring: 0,
        expired: 0,
        draft: 0,
        unmatched: matched.length,
      };

      setMatchStats(stats);
      onFeaturesMatched(matched, stats);

      toast.success(
        `Abgleich: ${stats.active} aktiv, ${stats.unmatched} ohne Vertrag`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Abgleich");
    } finally {
      setIsMatching(false);
    }
  }, [rawFeatures, parkId, onFeaturesMatched]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-medium">Katasterabfrage (WFS)</h4>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <div>
          <Label className="text-xs">Bundesland</Label>
          <Select value={service} onValueChange={setService}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WFS_SERVICE_OPTIONS.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Gemarkung *</Label>
          <Input
            className="h-8"
            placeholder="z.B. Barenburg"
            value={cadastralDistrict}
            onChange={(e) => setCadastralDistrict(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>

        <div>
          <Label className="text-xs">Flur</Label>
          <Input
            className="h-8"
            placeholder="z.B. 3"
            value={fieldNumber}
            onChange={(e) => setFieldNumber(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>

        <div className="flex items-end gap-1">
          <Button
            size="sm"
            className="h-8"
            onClick={handleSearch}
            disabled={isLoading || !cadastralDistrict.trim()}
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5 mr-1" />
            )}
            Suchen
          </Button>
          {rawFeatures.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={handleMatch}
              disabled={isMatching}
            >
              {isMatching ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
              )}
              Abgleich
            </Button>
          )}
        </div>
      </div>

      {/* Results summary */}
      {featureCount !== null && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <Badge variant="outline" className="text-xs">
            {featureCount} Flurstück(e)
          </Badge>
          {matchStats && (
            <>
              {matchStats.active > 0 && (
                <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
                  {matchStats.active} aktiv
                </Badge>
              )}
              {matchStats.expiring > 0 && (
                <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                  {matchStats.expiring} auslaufend
                </Badge>
              )}
              {matchStats.unmatched > 0 && (
                <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">
                  {matchStats.unmatched} ohne Vertrag
                </Badge>
              )}
              {matchStats.expired > 0 && (
                <Badge className="bg-gray-100 text-gray-800 border-gray-200 text-xs">
                  {matchStats.expired} abgelaufen
                </Badge>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
