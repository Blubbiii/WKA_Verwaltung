"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

// Default settlement article templates
const DEFAULT_SETTLEMENT_ARTICLES = [
  { type: "MINDESTPACHT", label: "Mindestnutzungsentgeld", taxRate: 0, accountNumber: "8400" },
  { type: "JAHRESNUTZUNGSENTGELD", label: "Jahresnutzungsentgeld", taxRate: 0, accountNumber: "8400" },
  { type: "VORSCHUSSVERRECHNUNG", label: "Verrechnung Vorschuesse", taxRate: 0, accountNumber: "8400" },
  { type: "ZUWEGUNG", label: "Zuwegungsentschaedigung", taxRate: 0, accountNumber: "8401" },
  { type: "KABELTRASSE", label: "Kabeltrassenentschaedigung", taxRate: 0, accountNumber: "8401" },
  { type: "AUSGLEICH", label: "Ausgleichsentschaedigung", taxRate: 0, accountNumber: "8401" },
];

interface SettlementArticle {
  type: string;
  label: string;
  taxRate: number;
  accountNumber: string;
}

const parkFormSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  shortName: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
});

type ParkFormValues = z.infer<typeof parkFormSchema>;

interface ParkFormProps {
  initialData?: {
    id: string;
    name: string;
    shortName?: string | null;
    description?: string | null;
    status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
    settlementArticles?: SettlementArticle[] | null;
    defaultPaymentDay?: number | null;
  };
}

export function ParkForm({ initialData }: ParkFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  // Settlement articles state (separate from react-hook-form since it's a complex JSON)
  const [articles, setArticles] = useState<SettlementArticle[]>(
    initialData?.settlementArticles ?? DEFAULT_SETTLEMENT_ARTICLES
  );
  const [paymentDay, setPaymentDay] = useState<string>(
    initialData?.defaultPaymentDay ? String(initialData.defaultPaymentDay) : "15"
  );

  const form = useForm<ParkFormValues>({
    resolver: zodResolver(parkFormSchema),
    defaultValues: {
      name: initialData?.name || "",
      shortName: initialData?.shortName || "",
      description: initialData?.description || "",
      status: initialData?.status || "ACTIVE",
    },
  });

  function updateArticle(index: number, field: keyof SettlementArticle, value: string | number) {
    setArticles((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function removeArticle(index: number) {
    setArticles((prev) => prev.filter((_, i) => i !== index));
  }

  function addArticle() {
    setArticles((prev) => [
      ...prev,
      { type: "", label: "", taxRate: 0, accountNumber: "" },
    ]);
  }

  async function onSubmit(data: ParkFormValues) {
    try {
      setIsLoading(true);

      const payload = {
        name: data.name,
        shortName: data.shortName || null,
        description: data.description || null,
        status: data.status,
        settlementArticles: articles.filter((a) => a.type && a.label),
        defaultPaymentDay: paymentDay ? parseInt(paymentDay, 10) : null,
      };

      const url = initialData ? `/api/parks/${initialData.id}` : "/api/parks";
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

      const park = await response.json();
      toast.success(initialData ? "Park gespeichert" : "Park erstellt");
      router.push(`/parks/${park.id}`);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Speichern"
      );
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
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="Windpark Nordsee" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="shortName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kurzbezeichnung</FormLabel>
                    <FormControl>
                      <Input placeholder="WP-NS" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Beschreibung</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Beschreibung des Windparks..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
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
                          <SelectValue placeholder="Status waehlen" />
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

        {/* Pachtabrechnungs-Konfiguration (nur bei Edit anzeigen) */}
        {initialData && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Gutschrift-Stichtag</CardTitle>
                <CardDescription>
                  Tag im Monat, an dem Gutschriften faellig werden (kann pro Vertrag ueberschrieben werden)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="space-y-2">
                    <Label>Standard-Stichtag (Tag im Monat)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={28}
                      className="w-32"
                      value={paymentDay}
                      onChange={(e) => setPaymentDay(e.target.value)}
                      placeholder="15"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground mt-6">
                    Gilt fuer alle Vertraege dieses Parks, sofern nicht individuell ueberschrieben.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Artikelkonten</CardTitle>
                <CardDescription>
                  Buchungskonten und MwSt-Saetze fuer Pachtabrechnungs-Positionen
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Header */}
                <div className="grid grid-cols-[1fr_2fr_80px_120px_40px] gap-2 text-sm font-medium text-muted-foreground">
                  <span>Typ</span>
                  <span>Bezeichnung</span>
                  <span>MwSt %</span>
                  <span>Konto</span>
                  <span />
                </div>

                {articles.map((article, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[1fr_2fr_80px_120px_40px] gap-2 items-center"
                  >
                    <Input
                      value={article.type}
                      onChange={(e) => updateArticle(index, "type", e.target.value)}
                      placeholder="MINDESTPACHT"
                      className="font-mono text-xs"
                    />
                    <Input
                      value={article.label}
                      onChange={(e) => updateArticle(index, "label", e.target.value)}
                      placeholder="Bezeichnung"
                    />
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={article.taxRate}
                      onChange={(e) => updateArticle(index, "taxRate", parseFloat(e.target.value) || 0)}
                    />
                    <Input
                      value={article.accountNumber}
                      onChange={(e) => updateArticle(index, "accountNumber", e.target.value)}
                      placeholder="8400"
                      className="font-mono"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeArticle(index)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addArticle}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Artikelkonto hinzufuegen
                </Button>
              </CardContent>
            </Card>
          </>
        )}

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
