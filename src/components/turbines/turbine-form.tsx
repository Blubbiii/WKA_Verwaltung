"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const turbineFormSchema = z.object({
  parkId: z.string().min(1, "Park ist erforderlich"),
  designation: z.string().min(1, "Bezeichnung ist erforderlich"),
  serialNumber: z.string().optional(),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  ratedPowerKw: z.coerce.number().min(0).optional().or(z.literal("")),
  hubHeightM: z.coerce.number().min(0).optional().or(z.literal("")),
  rotorDiameterM: z.coerce.number().min(0).optional().or(z.literal("")),
  commissioningDate: z.date().optional().nullable(),
  warrantyEndDate: z.date().optional().nullable(),
  latitude: z.coerce.number().min(-90).max(90).optional().or(z.literal("")),
  longitude: z.coerce.number().min(-180).max(180).optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
});

type TurbineFormValues = z.infer<typeof turbineFormSchema>;

interface Park {
  id: string;
  name: string;
  shortName: string | null;
}

interface TurbineFormProps {
  initialData?: {
    id: string;
    parkId: string;
    designation: string;
    serialNumber?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    ratedPowerKw?: number | null;
    hubHeightM?: number | null;
    rotorDiameterM?: number | null;
    commissioningDate?: string | null;
    warrantyEndDate?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  };
  defaultParkId?: string;
}

export function TurbineForm({ initialData, defaultParkId }: TurbineFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [parks, setParks] = useState<Park[]>([]);
  const [loadingParks, setLoadingParks] = useState(true);

  useEffect(() => {
    async function fetchParks() {
      try {
        const response = await fetch("/api/parks?limit=100&status=ACTIVE");
        if (response.ok) {
          const data = await response.json();
          setParks(data.data);
        }
      } catch {
        // Parks fetch failed silently
      } finally {
        setLoadingParks(false);
      }
    }
    fetchParks();
  }, []);

  const form = useForm<TurbineFormValues>({
    resolver: zodResolver(turbineFormSchema),
    defaultValues: {
      parkId: initialData?.parkId || defaultParkId || "",
      designation: initialData?.designation || "",
      serialNumber: initialData?.serialNumber || "",
      manufacturer: initialData?.manufacturer || "",
      model: initialData?.model || "",
      ratedPowerKw: initialData?.ratedPowerKw || "",
      hubHeightM: initialData?.hubHeightM || "",
      rotorDiameterM: initialData?.rotorDiameterM || "",
      commissioningDate: initialData?.commissioningDate
        ? new Date(initialData.commissioningDate)
        : null,
      warrantyEndDate: initialData?.warrantyEndDate
        ? new Date(initialData.warrantyEndDate)
        : null,
      latitude: initialData?.latitude || "",
      longitude: initialData?.longitude || "",
      status: initialData?.status || "ACTIVE",
    },
  });

  async function onSubmit(data: TurbineFormValues) {
    try {
      setIsLoading(true);

      const payload = {
        ...data,
        ratedPowerKw: data.ratedPowerKw === "" ? null : data.ratedPowerKw,
        hubHeightM: data.hubHeightM === "" ? null : data.hubHeightM,
        rotorDiameterM: data.rotorDiameterM === "" ? null : data.rotorDiameterM,
        latitude: data.latitude === "" ? null : data.latitude,
        longitude: data.longitude === "" ? null : data.longitude,
        commissioningDate: data.commissioningDate
          ? data.commissioningDate.toISOString()
          : null,
        warrantyEndDate: data.warrantyEndDate
          ? data.warrantyEndDate.toISOString()
          : null,
      };

      const url = initialData
        ? `/api/turbines/${initialData.id}`
        : "/api/turbines";
      const method = initialData ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }

      const turbine = await response.json();
      router.push(`/turbines/${turbine.id}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Speichern");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Basis-Informationen */}
        <Card>
          <CardHeader>
            <CardTitle>Basis-Informationen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="parkId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Windpark *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={loadingParks}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Park wählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {parks.map((park) => (
                          <SelectItem key={park.id} value={park.id}>
                            {park.name}
                            {park.shortName && ` (${park.shortName})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="designation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bezeichnung *</FormLabel>
                    <FormControl>
                      <Input placeholder="WEA 01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="serialNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Seriennummer</FormLabel>
                    <FormControl>
                      <Input placeholder="SN-12345" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Status wählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ACTIVE">Aktiv</SelectItem>
                        <SelectItem value="INACTIVE">Inaktiv</SelectItem>
                        <SelectItem value="ARCHIVED">Archiviert</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Technische Daten */}
        <Card>
          <CardHeader>
            <CardTitle>Technische Daten</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="manufacturer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hersteller</FormLabel>
                    <FormControl>
                      <Input placeholder="Vestas" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Modell</FormLabel>
                    <FormControl>
                      <Input placeholder="V150-4.2" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="ratedPowerKw"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nennleistung (kW)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="4200"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="hubHeightM"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nabenhöhe (m)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="166"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rotorDiameterM"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rotordurchmesser (m)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.1"
                        placeholder="150"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="commissioningDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Inbetriebnahme</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "dd.MM.yyyy")
                            ) : (
                              <span>Datum wählen</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={field.onChange}
                          disabled={(date) => date > new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="warrantyEndDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Garantie bis</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "dd.MM.yyyy")
                            ) : (
                              <span>Datum wählen</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Standort */}
        <Card>
          <CardHeader>
            <CardTitle>Standort</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="latitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Breitengrad</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder="54.1234"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Dezimalgrad (-90 bis 90)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="longitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Längengrad</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        placeholder="8.5678"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Dezimalgrad (-180 bis 180)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isLoading}
          >
            Abbrechen
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {initialData ? "Speichern" : "Erstellen"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
