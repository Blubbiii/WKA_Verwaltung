"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CONTRACT_STATUS } from "@/lib/status-config";
import { CONTRACT_REMINDER_DAYS_DEFAULT } from "@/lib/config/business-thresholds";

interface SelectOption {
  id: string;
  name: string;
}

const statusOptions = Object.entries(CONTRACT_STATUS).map(([value, { label }]) => ({
  value,
  label,
}));

export default function EditContractPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations("contracts");
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [parks, setParks] = useState<SelectOption[]>([]);
  const [funds, setFunds] = useState<SelectOption[]>([]);
  const [partners, setPartners] = useState<SelectOption[]>([]);
  const [reminderDays, setReminderDays] = useState<number[]>([...CONTRACT_REMINDER_DAYS_DEFAULT]);
  const [newReminder, setNewReminder] = useState("");

  const contractFormSchema = z.object({
    contractType: z.enum([
      "LEASE",
      "SERVICE",
      "INSURANCE",
      "GRID_CONNECTION",
      "MARKETING",
      "OTHER",
    ]),
    contractNumber: z.string().optional(),
    title: z.string().min(1, t("edit.titleRequired")),
    startDate: z.string().min(1, t("edit.startDateRequired")),
    endDate: z.string().optional(),
    noticePeriodMonths: z.coerce.number().int().positive().optional(),
    autoRenewal: z.boolean().default(false),
    renewalPeriodMonths: z.coerce.number().int().positive().optional(),
    annualValue: z.coerce.number().positive().optional(),
    paymentTerms: z.string().optional(),
    status: z.enum(["DRAFT", "ACTIVE", "EXPIRING", "EXPIRED", "TERMINATED"]),
    notes: z.string().optional(),
    parkId: z.string().optional(),
    fundId: z.string().optional(),
    partnerId: z.string().optional(),
  });

  type ContractFormValues = z.infer<typeof contractFormSchema>;

  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractFormSchema) as Resolver<ContractFormValues>,
    defaultValues: {
      contractType: "SERVICE",
      title: "",
      contractNumber: "",
      startDate: "",
      endDate: "",
      noticePeriodMonths: undefined,
      autoRenewal: false,
      renewalPeriodMonths: 12,
      annualValue: undefined,
      paymentTerms: "",
      status: "ACTIVE",
      notes: "",
      parkId: "",
      fundId: "",
      partnerId: "",
    },
  });

  const autoRenewal = form.watch("autoRenewal");

  useEffect(() => {
    async function fetchData() {
      try {
        const [contractRes, parksRes, fundsRes, personsRes] = await Promise.all([
          fetch(`/api/contracts/${params.id}`),
          fetch("/api/parks?limit=100"),
          fetch("/api/funds?limit=100"),
          fetch("/api/persons?limit=100"),
        ]);

        if (contractRes.ok) {
          const contract = await contractRes.json();
          form.reset({
            contractType: contract.contractType,
            contractNumber: contract.contractNumber || "",
            title: contract.title,
            startDate: contract.startDate.split("T")[0],
            endDate: contract.endDate?.split("T")[0] || "",
            noticePeriodMonths: contract.noticePeriodMonths || undefined,
            autoRenewal: contract.autoRenewal,
            renewalPeriodMonths: contract.renewalPeriodMonths || 12,
            annualValue: contract.annualValue || undefined,
            paymentTerms: contract.paymentTerms || "",
            status: contract.status,
            notes: contract.notes || "",
            parkId: contract.park?.id || "",
            fundId: contract.fund?.id || "",
            partnerId: contract.partner?.id || "",
          });
          setReminderDays(contract.reminderDays || [...CONTRACT_REMINDER_DAYS_DEFAULT]);
        }

        if (parksRes.ok) {
          const data = await parksRes.json();
          setParks(
            data.data.map((p: { id: string; name: string; shortName?: string | null }) => ({
              id: p.id,
              name: p.shortName || p.name,
            }))
          );
        }
        if (fundsRes.ok) {
          const data = await fundsRes.json();
          setFunds(data.data.map((f: { id: string; name: string }) => ({ id: f.id, name: f.name })));
        }
        if (personsRes.ok) {
          const data = await personsRes.json();
          setPartners(data.data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
        }
      } catch {
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [params.id, form]);

  function addReminder() {
    const days = parseInt(newReminder);
    if (days > 0 && !reminderDays.includes(days)) {
      setReminderDays([...reminderDays, days].sort((a, b) => b - a));
      setNewReminder("");
    }
  }

  function removeReminder(days: number) {
    setReminderDays(reminderDays.filter((d) => d !== days));
  }

  async function onSubmit(data: ContractFormValues) {
    try {
      setIsSubmitting(true);

      const payload = {
        ...data,
        reminderDays,
        noticePeriodMonths: data.noticePeriodMonths || null,
        renewalPeriodMonths: data.autoRenewal ? data.renewalPeriodMonths : null,
        annualValue: data.annualValue || null,
        parkId: data.parkId && data.parkId !== "_none" ? data.parkId : null,
        fundId: data.fundId && data.fundId !== "_none" ? data.fundId : null,
        partnerId: data.partnerId && data.partnerId !== "_none" ? data.partnerId : null,
        endDate: data.endDate || null,
        contractNumber: data.contractNumber || null,
        paymentTerms: data.paymentTerms || null,
        notes: data.notes || null,
      };

      const response = await fetch(`/api/contracts/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t("edit.errorSaving"));
      }

      router.push(`/contracts/${params.id}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("edit.errorSaving"));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const typeKeys = ["LEASE", "SERVICE", "INSURANCE", "GRID_CONNECTION", "MARKETING", "OTHER"] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/contracts/${params.id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("edit.title")}</h1>
          <p className="text-muted-foreground">{t("edit.description")}</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>{t("edit.basicInfo")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="contractType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("edit.contractType")} *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("edit.contractTypeRequired")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {typeKeys.map((key) => (
                            <SelectItem key={key} value={key}>
                              {t(`types.${key}`)}
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
                  name="contractNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("edit.contractNumber")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("edit.contractNumberPlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("edit.titleField")} *</FormLabel>
                    <FormControl>
                      <Input placeholder={t("edit.titlePlaceholder")} {...field} />
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
                    <FormLabel>{t("edit.status")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {statusOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
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

          {/* Duration */}
          <Card>
            <CardHeader>
              <CardTitle>{t("edit.duration")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("edit.startDate")} *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("edit.endDate")}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormDescription>{t("edit.endDateDescription")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="noticePeriodMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("edit.noticePeriodMonths")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        placeholder={t("edit.noticePeriodPlaceholder")}
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center space-x-4 pt-2">
                <FormField
                  control={form.control}
                  name="autoRenewal"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">{t("edit.autoRenewal")}</FormLabel>
                    </FormItem>
                  )}
                />
              </div>

              {autoRenewal && (
                <FormField
                  control={form.control}
                  name="renewalPeriodMonths"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("edit.renewalPeriodMonths")}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          placeholder="12"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
          </Card>

          {/* Financial */}
          <Card>
            <CardHeader>
              <CardTitle>{t("edit.financial")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="annualValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("edit.annualValue")}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          {...field}
                          value={field.value || ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="paymentTerms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("edit.paymentTerms")}</FormLabel>
                      <FormControl>
                        <Input placeholder={t("edit.paymentTermsPlaceholder")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Associations */}
          <Card>
            <CardHeader>
              <CardTitle>{t("edit.assignments")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="parkId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("edit.windpark")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("edit.noWindpark")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">{t("edit.noWindpark")}</SelectItem>
                          {parks.map((park) => (
                            <SelectItem key={park.id} value={park.id}>
                              {park.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="fundId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("edit.fundLabel")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("edit.noFund")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">{t("edit.noFund")}</SelectItem>
                          {funds.map((fund) => (
                            <SelectItem key={fund.id} value={fund.id}>
                              {fund.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
                        <Link href="/funds/new" target="_blank">
                          <Plus className="mr-1 h-3 w-3" />
                          {t("edit.newFund")}
                        </Link>
                      </Button>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="partnerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("edit.partnerLabel")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("edit.noPartner")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">{t("edit.noPartner")}</SelectItem>
                          {partners.map((partner) => (
                            <SelectItem key={partner.id} value={partner.id}>
                              {partner.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Reminders */}
          <Card>
            <CardHeader>
              <CardTitle>{t("edit.reminders")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {reminderDays.map((days) => (
                  <Badge key={days} variant="secondary">
                    {t("edit.reminderDaysBefore", { days })}
                    <button
                      type="button"
                      onClick={() => removeReminder(days)}
                      className="ml-2 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="1"
                  placeholder={t("edit.reminderDaysPlaceholder")}
                  value={newReminder}
                  onChange={(e) => setNewReminder(e.target.value)}
                  className="w-32"
                />
                <Button type="button" variant="outline" onClick={addReminder}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("edit.reminderAdd")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle>{t("edit.notesTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        placeholder={t("edit.notesPlaceholder")}
                        rows={4}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={isSubmitting}
            >
              {t("edit.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("edit.save")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
