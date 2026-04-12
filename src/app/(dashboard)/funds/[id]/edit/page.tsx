"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ArrowLeft, CalendarIcon, Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Fund {
  id: string;
  name: string;
  legalForm: string | null;
  registrationNumber: string | null;
  registrationCourt: string | null;
  foundingDate: string | null;
  totalCapital: number | null;
  managingDirector: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  city: string | null;
  bankDetails: {
    iban?: string;
    bic?: string;
    bankName?: string;
  } | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
}

export default function EditFundPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const t = useTranslations("funds");
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fundFormSchema = z.object({
    name: z.string().min(1, t("form.nameRequired")),
    legalForm: z.string().optional(),
    registrationNumber: z.string().optional(),
    registrationCourt: z.string().optional(),
    foundingDate: z.date().optional().nullable(),
    totalCapital: z.coerce.number().min(0).optional().or(z.literal("")),
    managingDirector: z.string().optional(),
    street: z.string().optional(),
    houseNumber: z.string().optional(),
    postalCode: z.string().optional(),
    city: z.string().optional(),
    bankIban: z.string().optional(),
    bankBic: z.string().optional(),
    bankName: z.string().optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
    // Fund-specific email settings
    emailFromName: z.string().max(100).optional(),
    emailFromAddress: z.string().max(200).optional(),
    emailSmtpHost: z.string().max(200).optional(),
    emailSmtpPort: z.coerce.number().int().min(1).max(65535).optional().or(z.literal("")),
    emailSmtpUser: z.string().max(200).optional(),
    emailSmtpPassword: z.string().max(500).optional(),
    emailSmtpSecure: z.boolean().optional(),
  });

  type FundFormValues = z.infer<typeof fundFormSchema>;

  const form = useForm<FundFormValues>({
    resolver: zodResolver(fundFormSchema) as Resolver<FundFormValues>,
    defaultValues: {
      name: "",
      legalForm: "",
      registrationNumber: "",
      registrationCourt: "",
      foundingDate: null,
      totalCapital: "",
      managingDirector: "",
      street: "",
      houseNumber: "",
      postalCode: "",
      city: "",
      bankIban: "",
      bankBic: "",
      bankName: "",
      status: "ACTIVE",
    },
  });

  useEffect(() => {
    fetchFund();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function fetchFund() {
    try {
      setIsFetching(true);
      const response = await fetch(`/api/funds/${id}`);
      if (!response.ok) {
        if (response.status === 404) {
          setError(t("form.notFound"));
        } else {
          throw new Error(t("form.loadErrorGeneric"));
        }
        return;
      }
      const fund: Fund = await response.json();

      form.reset({
        name: fund.name,
        legalForm: fund.legalForm || "",
        registrationNumber: fund.registrationNumber || "",
        registrationCourt: fund.registrationCourt || "",
        foundingDate: fund.foundingDate ? new Date(fund.foundingDate) : null,
        totalCapital: fund.totalCapital ?? "",
        managingDirector: fund.managingDirector || "",
        street: fund.street || "",
        houseNumber: fund.houseNumber || "",
        postalCode: fund.postalCode || "",
        city: fund.city || "",
        bankIban: fund.bankDetails?.iban || "",
        bankBic: fund.bankDetails?.bic || "",
        bankName: fund.bankDetails?.bankName || "",
        status: fund.status,
      });
    } catch {
      setError(t("form.loadError"));
    } finally {
      setIsFetching(false);
    }
  }

  async function onSubmit(data: FundFormValues) {
    try {
      setIsLoading(true);

      const payload = {
        ...data,
        totalCapital: data.totalCapital === "" ? null : data.totalCapital,
        foundingDate: data.foundingDate?.toISOString() || null,
        bankDetails: {
          iban: data.bankIban || undefined,
          bic: data.bankBic || undefined,
          bankName: data.bankName || undefined,
        },
      };

      const response = await fetch(`/api/funds/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t("form.saveError"));
      }

      router.push(`/funds/${id}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("form.saveError"));
    } finally {
      setIsLoading(false);
    }
  }

  if (isFetching) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="mt-2 h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-lg text-muted-foreground">{error}</p>
        <Button asChild className="mt-4">
          <Link href="/funds">{t("form.backToList")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/funds/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("form.editTitle")}</h1>
          <p className="text-muted-foreground">
            {t("form.editDescription")}
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("form.basicInfo")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.name")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("form.namePlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="legalForm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.legalForm")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("form.legalFormPlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="registrationNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.registrationNumber")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("form.registrationNumberPlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="registrationCourt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.registrationCourt")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("form.registrationCourtPlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="foundingDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.foundingDate")}</FormLabel>
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
                                <span>{t("form.selectDate")}</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            captionLayout="dropdown"
                            selected={field.value || undefined}
                            onSelect={field.onChange}
                            disabled={(date) => date > new Date()}
                            startMonth={new Date(1980, 0)}
                            endMonth={new Date()}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="totalCapital"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.totalCapital")}</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder={t("form.totalCapitalPlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="managingDirector"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.managingDirector")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("form.managingDirectorPlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-12 gap-4">
                <div className="col-span-8">
                  <FormField
                    control={form.control}
                    name="street"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("form.street")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("form.streetPlaceholder")} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="col-span-4">
                  <FormField
                    control={form.control}
                    name="houseNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("form.houseNumber")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("form.houseNumberPlaceholder")} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="col-span-4">
                  <FormField
                    control={form.control}
                    name="postalCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("form.postalCode")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("form.postalCodePlaceholder")} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="col-span-8">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("form.city")}</FormLabel>
                        <FormControl>
                          <Input placeholder={t("form.cityPlaceholder")} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.status")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("form.statusPlaceholder")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ACTIVE">{t("status.active")}</SelectItem>
                        <SelectItem value="INACTIVE">{t("status.inactive")}</SelectItem>
                        <SelectItem value="ARCHIVED">{t("status.archived")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("form.bankDetails")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="bankIban"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.iban")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("form.ibanPlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="bankBic"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.bic")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("form.bicPlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bankName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.bank")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("form.bankPlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* E-Mail-Einstellungen */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                {t("form.emailSettings")}
              </CardTitle>
              <CardDescription>
                {t("form.emailSettingsDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="emailFromName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.senderName")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("form.senderNamePlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="emailFromAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.senderEmail")}</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder={t("form.senderEmailPlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Separator />

              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t("form.smtpOptional")}</p>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="emailSmtpHost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.smtpHost")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("form.smtpHostPlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="emailSmtpPort"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.smtpPort")}</FormLabel>
                      <FormControl>
                        <Input type="number" placeholder={t("form.smtpPortPlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="emailSmtpUser"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.smtpUser")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("form.smtpUserPlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="emailSmtpPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.smtpPassword")}</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder={t("form.smtpPasswordPlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="emailSmtpSecure"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <input
                        type="checkbox"
                        checked={field.value ?? true}
                        onChange={field.onChange}
                        className="rounded"
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">{t("form.smtpTls")}</FormLabel>
                  </FormItem>
                )}
              />

              {/* Test button */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={async () => {
                  const host = form.getValues("emailSmtpHost");
                  const fromAddr = form.getValues("emailFromAddress");
                  if (!host || !fromAddr) {
                    toast.error(t("form.testEmailError"));
                    return;
                  }
                  toast.info(t("form.testEmailSending"));
                }}
              >
                <Send className="h-3.5 w-3.5" />
                {t("form.testEmail")}
              </Button>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isLoading}
            >
              {t("form.cancel")}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("form.save")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
