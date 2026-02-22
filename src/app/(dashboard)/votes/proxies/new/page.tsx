"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ArrowLeft, CalendarIcon, Loader2 } from "lucide-react";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const proxyFormSchema = z.object({
  fundId: z.string().min(1, "Gesellschaft ist erforderlich"),
  grantorId: z.string().min(1, "Vollmachtgeber ist erforderlich"),
  granteeId: z.string().min(1, "Vollmachtnehmer ist erforderlich"),
  proxyType: z.enum(["general", "specific"]),
  voteId: z.string().optional(),
  validFrom: z.date({ required_error: "Gültig ab ist erforderlich" }),
  validUntil: z.date().optional().nullable(),
});

type ProxyFormValues = z.infer<typeof proxyFormSchema>;

interface Fund {
  id: string;
  name: string;
}

interface Shareholder {
  id: string;
  shareholderNumber: string | null;
  name: string;
}

interface Vote {
  id: string;
  title: string;
  status: string;
}

export default function NewProxyPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [shareholders, setShareholders] = useState<Shareholder[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loadingFunds, setLoadingFunds] = useState(true);
  const [loadingShareholders, setLoadingShareholders] = useState(false);
  const [loadingVotes, setLoadingVotes] = useState(false);

  const form = useForm<ProxyFormValues>({
    resolver: zodResolver(proxyFormSchema),
    defaultValues: {
      fundId: "",
      grantorId: "",
      granteeId: "",
      proxyType: "general",
      voteId: "",
      validFrom: new Date(),
      validUntil: null,
    },
  });

  const selectedFundId = form.watch("fundId");
  const proxyType = form.watch("proxyType");
  const grantorId = form.watch("grantorId");

  useEffect(() => {
    async function fetchFunds() {
      try {
        const response = await fetch("/api/funds?limit=100&status=ACTIVE");
        if (response.ok) {
          const data = await response.json();
          setFunds(data.data);
        }
      } catch {
      } finally {
        setLoadingFunds(false);
      }
    }
    fetchFunds();
  }, []);

  useEffect(() => {
    if (!selectedFundId) {
      setShareholders([]);
      setVotes([]);
      return;
    }

    async function fetchShareholdersAndVotes() {
      setLoadingShareholders(true);
      setLoadingVotes(true);

      try {
        // Fetch shareholders for selected fund
        const shResponse = await fetch(`/api/shareholders?fundId=${selectedFundId}&status=ACTIVE`);
        if (shResponse.ok) {
          const shData = await shResponse.json();
          setShareholders(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            shData.data.map((sh: any) => ({
              id: sh.id,
              shareholderNumber: sh.shareholderNumber,
              name:
                sh.person?.companyName ||
                [sh.person?.firstName, sh.person?.lastName].filter(Boolean).join(" "),
            }))
          );
        }

        // Fetch active votes for selected fund
        const voteResponse = await fetch(`/api/votes?fundId=${selectedFundId}&status=ACTIVE`);
        if (voteResponse.ok) {
          const voteData = await voteResponse.json();
          setVotes(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            voteData.data.map((v: any) => ({
              id: v.id,
              title: v.title,
              status: v.status,
            }))
          );
        }
      } catch {
      } finally {
        setLoadingShareholders(false);
        setLoadingVotes(false);
      }
    }

    fetchShareholdersAndVotes();
  }, [selectedFundId]);

  async function onSubmit(data: ProxyFormValues) {
    try {
      setIsLoading(true);

      const payload = {
        grantorId: data.grantorId,
        granteeId: data.granteeId,
        voteId: data.proxyType === "specific" ? data.voteId : null,
        validFrom: data.validFrom.toISOString(),
        validUntil: data.validUntil?.toISOString() || null,
      };

      const response = await fetch("/api/proxies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Fehler beim Speichern");
      }

      router.push("/votes/proxies");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fehler beim Speichern");
    } finally {
      setIsLoading(false);
    }
  }

  // Filter out grantor from grantee options
  const availableGrantees = shareholders.filter((sh) => sh.id !== grantorId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/votes/proxies">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Neue Vollmacht</h1>
          <p className="text-muted-foreground">
            Erteilen Sie eine Stimmrechtsvollmacht
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Gesellschaft wählen</CardTitle>
              <CardDescription>
                Wählen Sie die Gesellschaft, für die die Vollmacht erteilt werden soll
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="fundId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gesellschaft *</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        form.setValue("grantorId", "");
                        form.setValue("granteeId", "");
                        form.setValue("voteId", "");
                      }}
                      value={field.value}
                      disabled={loadingFunds}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Gesellschaft wählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {funds.map((fund) => (
                          <SelectItem key={fund.id} value={fund.id}>
                            {fund.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {selectedFundId && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Beteiligte Personen</CardTitle>
                  <CardDescription>
                    Vollmachtgeber überträgt sein Stimmrecht an den Vollmachtnehmer
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="grantorId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vollmachtgeber *</FormLabel>
                          <Select
                            onValueChange={(value) => {
                              field.onChange(value);
                              // Reset grantee if it was the same as new grantor
                              if (form.getValues("granteeId") === value) {
                                form.setValue("granteeId", "");
                              }
                            }}
                            value={field.value}
                            disabled={loadingShareholders}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Wählen..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {shareholders.map((sh) => (
                                <SelectItem key={sh.id} value={sh.id}>
                                  {sh.name}
                                  {sh.shareholderNumber && ` (${sh.shareholderNumber})`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Person, die ihre Stimme überträgt
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="granteeId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vollmachtnehmer *</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                            disabled={loadingShareholders || !grantorId}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Wählen..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {availableGrantees.map((sh) => (
                                <SelectItem key={sh.id} value={sh.id}>
                                  {sh.name}
                                  {sh.shareholderNumber && ` (${sh.shareholderNumber})`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Person, die das Stimmrecht ausübt
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Art der Vollmacht</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="proxyType"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="flex flex-col space-y-3"
                          >
                            <div className="flex items-start space-x-3 p-4 border rounded-lg">
                              <RadioGroupItem value="general" id="general" />
                              <div className="space-y-1">
                                <Label htmlFor="general" className="font-medium cursor-pointer">
                                  Generalvollmacht
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                  Gilt für alle aktuellen und zukünftigen Abstimmungen
                                </p>
                              </div>
                            </div>
                            <div className="flex items-start space-x-3 p-4 border rounded-lg">
                              <RadioGroupItem value="specific" id="specific" />
                              <div className="space-y-1">
                                <Label htmlFor="specific" className="font-medium cursor-pointer">
                                  Einzelvollmacht
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                  Gilt nur für eine bestimmte Abstimmung
                                </p>
                              </div>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {proxyType === "specific" && (
                    <FormField
                      control={form.control}
                      name="voteId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Abstimmung *</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                            disabled={loadingVotes}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Abstimmung wählen..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {votes.length === 0 ? (
                                <SelectItem value="_placeholder" disabled>
                                  Keine aktiven Abstimmungen
                                </SelectItem>
                              ) : (
                                votes.map((vote) => (
                                  <SelectItem key={vote.id} value={vote.id}>
                                    {vote.title}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Gültigkeit</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="validFrom"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gültig ab *</FormLabel>
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
                                selected={field.value}
                                onSelect={field.onChange}
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
                      name="validUntil"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gültig bis (optional)</FormLabel>
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
                                    <span>Unbefristet</span>
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
                          <FormDescription>
                            Leer lassen für unbefristete Gültigkeit
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
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
            <Button type="submit" disabled={isLoading || !selectedFundId}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Vollmacht erteilen
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
