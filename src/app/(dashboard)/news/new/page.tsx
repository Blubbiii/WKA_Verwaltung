"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor-dynamic";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const NEWS_CATEGORIES = [
  { value: "GENERAL", label: "Allgemein", description: "Allgemeine Neuigkeiten" },
  { value: "FINANCIAL", label: "Finanziell", description: "Finanzielle Informationen" },
  { value: "TECHNICAL", label: "Technisch", description: "Technische Mitteilungen" },
  { value: "LEGAL", label: "Rechtlich", description: "Rechtliche Hinweise" },
] as const;

const newsFormSchema = z.object({
  title: z.string().min(1, "Titel ist erforderlich"),
  content: z.string().min(1, "Inhalt ist erforderlich"),
  category: z.enum(["GENERAL", "FINANCIAL", "TECHNICAL", "LEGAL"]).default("GENERAL"),
  fundId: z.string().optional(),
  isPublished: z.boolean().default(false),
  expiresAt: z.string().optional(),
});

type NewsFormValues = z.infer<typeof newsFormSchema>;

interface Fund {
  id: string;
  name: string;
}

export default function NewNewsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [funds, setFunds] = useState<Fund[]>([]);

  const form = useForm<NewsFormValues>({
    resolver: zodResolver(newsFormSchema),
    defaultValues: {
      title: "",
      content: "",
      category: "GENERAL",
      fundId: "_none",
      isPublished: false,
      expiresAt: "",
    },
  });

  useEffect(() => {
    async function loadFunds() {
      try {
        const response = await fetch("/api/funds");
        if (response.ok) {
          const data = await response.json();
          setFunds(data.data || []);
        }
      } catch {
      }
    }
    loadFunds();
  }, []);

  async function onSubmit(data: NewsFormValues) {
    try {
      setIsLoading(true);

      const response = await fetch("/api/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.title,
          content: data.content,
          category: data.category,
          fundId: data.fundId && data.fundId !== "_none" ? data.fundId : null,
          isPublished: data.isPublished,
          expiresAt: data.expiresAt || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Erstellen der Meldung");
      }

      router.push("/news");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Erstellen");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/news">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Neue Meldung</h1>
          <p className="text-muted-foreground">
            Erstellen Sie eine neue Nachricht für Ihre Gesellschafter
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Meldung erstellen</CardTitle>
          <CardDescription>
            Füllen Sie die Felder aus, um eine neue Meldung zu erstellen
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Titel *</FormLabel>
                    <FormControl>
                      <Input placeholder="Titel der Meldung" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Inhalt *</FormLabel>
                    <FormControl>
                      <RichTextEditor
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Schreiben Sie hier Ihre Nachricht..."
                      />
                    </FormControl>
                    <FormDescription>
                      Nutzen Sie die Toolbar für Formatierungen wie Überschriften, Listen und Links
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kategorie</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Kategorie waehlen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {NEWS_CATEGORIES.map((category) => (
                          <SelectItem key={category.value} value={category.value}>
                            {category.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Kategorisieren Sie die Meldung für bessere Filterbarkeit
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="fundId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gesellschaft</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Für alle Gesellschaften" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">Alle Gesellschaften</SelectItem>
                          {funds.map((fund) => (
                            <SelectItem key={fund.id} value={fund.id}>
                              {fund.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Optional: Nur für eine bestimmte Gesellschaft anzeigen
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="expiresAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ablaufdatum</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormDescription>
                        Optional: Wann soll die Meldung ablaufen?
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="isPublished"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        Sofort veröffentlichen
                      </FormLabel>
                      <FormDescription>
                        Wenn aktiviert, wird die Meldung sofort sichtbar. Andernfalls
                        wird sie als Entwurf gespeichert.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-4">
                <Link href="/news">
                  <Button variant="outline" type="button">
                    Abbrechen
                  </Button>
                </Link>
                <Button type="submit" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {form.watch("isPublished") ? (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Veröffentlichen
                    </>
                  ) : (
                    "Als Entwurf speichern"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
