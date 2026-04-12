"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ArrowLeft, CalendarIcon, Loader2 } from "lucide-react";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function NewFundPage() {
  const router = useRouter();
  const t = useTranslations("funds");
  const [isLoading, setIsLoading] = useState(false);

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

      const response = await fetch("/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t("form.saveError"));
      }

      const fund = await response.json();
      router.push(`/funds/${fund.id}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("form.saveError"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/funds">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("form.newTitle")}</h1>
          <p className="text-muted-foreground">
            {t("form.newDescription")}
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
              {t("form.create")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
