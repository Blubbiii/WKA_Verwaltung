"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2, Upload, File, X, Info, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { useFileUpload } from "@/hooks/useFileUpload";
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
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

const documentFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  category: z.enum([
    "CONTRACT",
    "PROTOCOL",
    "REPORT",
    "INVOICE",
    "PERMIT",
    "CORRESPONDENCE",
    "OTHER",
  ]),
  tags: z.array(z.string()).default([]),
  parkId: z.string().optional(),
  fundId: z.string().optional(),
  contractId: z.string().optional(),
  shareholderId: z.string().optional(),
  turbineId: z.string().optional(),
  serviceEventId: z.string().optional(),
});

type DocumentFormValues = z.infer<typeof documentFormSchema>;

interface SelectOption {
  id: string;
  name: string;
}

interface ServiceEventOption {
  id: string;
  eventType: string;
  eventDate: string;
  turbineDesignation: string;
}

const categoryKeys = [
  "CONTRACT",
  "PROTOCOL",
  "REPORT",
  "INVOICE",
  "PERMIT",
  "CORRESPONDENCE",
  "OTHER",
] as const;

const eventTypeKeys = [
  "MAINTENANCE",
  "REPAIR",
  "INSPECTION",
  "BLADE_INSPECTION",
  "GEARBOX_SERVICE",
  "GENERATOR_SERVICE",
  "SOFTWARE_UPDATE",
  "EMERGENCY",
  "OTHER",
] as const;

function DocumentUploadForm() {
  const t = useTranslations("documents.upload");
  const tCat = useTranslations("documents.categories");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read query parameters
  const preselectedParkId = searchParams.get("parkId") || "";
  const preselectedFundId = searchParams.get("fundId") || "";
  const preselectedContractId = searchParams.get("contractId") || "";
  const preselectedShareholderId = searchParams.get("shareholderId") || "";
  const preselectedTurbineId = searchParams.get("turbineId") || "";
  const preselectedServiceEventId = searchParams.get("serviceEventId") || "";

  const [isLoading, setIsLoading] = useState(false);
  const [parks, setParks] = useState<SelectOption[]>([]);
  const [funds, setFunds] = useState<SelectOption[]>([]);
  const [contracts, setContracts] = useState<SelectOption[]>([]);
  const [shareholders, setShareholders] = useState<SelectOption[]>([]);
  const [turbines, setTurbines] = useState<SelectOption[]>([]);
  const [serviceEvents, setServiceEvents] = useState<ServiceEventOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [newTag, setNewTag] = useState("");
  const [preselectedInfo, setPreselectedInfo] = useState<string | null>(null);

  const { upload, isUploading: isFileUploading, progress: uploadProgress, cancel: cancelUpload } = useFileUpload({
    onError: (msg) => toast.error(msg),
  });

  const form = useForm<DocumentFormValues>({
    resolver: zodResolver(documentFormSchema) as Resolver<DocumentFormValues>,
    defaultValues: {
      title: "",
      description: "",
      category: "OTHER",
      tags: [],
      parkId: preselectedParkId || "",
      fundId: preselectedFundId || "",
      contractId: preselectedContractId || "",
      shareholderId: preselectedShareholderId || "",
      turbineId: preselectedTurbineId || "",
      serviceEventId: preselectedServiceEventId || "",
    },
  });

  const tags = form.watch("tags");

  useEffect(() => {
    async function fetchOptions() {
      try {
        const [parksRes, fundsRes, contractsRes, shareholdersRes, turbinesRes, serviceEventsRes] =
          await Promise.all([
            fetch("/api/parks?limit=100"),
            fetch("/api/funds?limit=100"),
            fetch("/api/contracts?limit=100"),
            fetch("/api/shareholders?limit=100"),
            fetch("/api/turbines?limit=100"),
            fetch("/api/service-events?limit=100"),
          ]);

        if (parksRes.ok) {
          const data = await parksRes.json();
          setParks(
            data.data.map((p: { id: string; name: string; shortName?: string | null }) => ({ id: p.id, name: p.shortName || p.name }))
          );
        }
        if (fundsRes.ok) {
          const data = await fundsRes.json();
          setFunds(data.data.map((f: { id: string; name: string }) => ({ id: f.id, name: f.name })));
        }
        if (contractsRes.ok) {
          const data = await contractsRes.json();
          setContracts(data.data.map((c: { id: string; title: string }) => ({ id: c.id, name: c.title })));
        }
        if (shareholdersRes.ok) {
          const data = await shareholdersRes.json();
          setShareholders(
            data.data.map((s: { id: string; person?: { name?: string } | null }) => ({ id: s.id, name: s.person?.name || s.id }))
          );
        }
        if (turbinesRes.ok) {
          const data = await turbinesRes.json();
          setTurbines(
            data.data.map((tb: { id: string; designation: string; park?: { shortName?: string | null } | null }) => ({
              id: tb.id,
              name: `${tb.designation}${tb.park?.shortName ? ` (${tb.park.shortName})` : ""}`
            }))
          );
        }
        if (serviceEventsRes.ok) {
          const data = await serviceEventsRes.json();
          setServiceEvents(
            data.data.map((e: { id: string; eventType: string; eventDate: string; turbine?: { designation?: string } | null }) => ({
              id: e.id,
              eventType: e.eventType,
              eventDate: e.eventDate,
              turbineDesignation: e.turbine?.designation || tCommon("unknown"),
            }))
          );
        }

        // Build preselection info message
        const infoParts: string[] = [];
        if (preselectedServiceEventId) {
          const event = serviceEventsRes.ok
            ? (await serviceEventsRes.json()).data?.find((e: { id: string }) => e.id === preselectedServiceEventId)
            : null;
          if (event) {
            infoParts.push(`${t("serviceEvent")}: ${t(`eventTypes.${event.eventType}`)} (${event.turbine?.designation})`);
          } else {
            infoParts.push("Service-Event");
          }
        }
        if (preselectedTurbineId) infoParts.push(t("turbine"));
        if (preselectedParkId) infoParts.push(t("windpark"));
        if (preselectedFundId) infoParts.push(t("fund"));
        if (preselectedContractId) infoParts.push(t("contract"));
        if (preselectedShareholderId) infoParts.push(t("shareholderLabel"));

        if (infoParts.length > 0) {
          setPreselectedInfo(t("preselected", { items: infoParts.join(", ") }));
        }
      } catch {
      } finally {
        setLoadingOptions(false);
      }
    }
    fetchOptions();
  }, [preselectedServiceEventId, preselectedTurbineId, preselectedParkId, preselectedFundId, preselectedContractId, preselectedShareholderId]);

  // Set preselected values once options are loaded
  useEffect(() => {
    if (!loadingOptions) {
      if (preselectedParkId) form.setValue("parkId", preselectedParkId);
      if (preselectedFundId) form.setValue("fundId", preselectedFundId);
      if (preselectedContractId) form.setValue("contractId", preselectedContractId);
      if (preselectedShareholderId) form.setValue("shareholderId", preselectedShareholderId);
      if (preselectedTurbineId) form.setValue("turbineId", preselectedTurbineId);
      if (preselectedServiceEventId) form.setValue("serviceEventId", preselectedServiceEventId);
    }
  }, [loadingOptions, preselectedParkId, preselectedFundId, preselectedContractId, preselectedShareholderId, preselectedTurbineId, preselectedServiceEventId, form]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!form.getValues("title")) {
        form.setValue("title", file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  }

  function removeFile() {
    setSelectedFile(null);
  }

  function addTag() {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      form.setValue("tags", [...tags, newTag.trim()]);
      setNewTag("");
    }
  }

  function removeTag(index: number) {
    form.setValue(
      "tags",
      tags.filter((_, i) => i !== index)
    );
  }

  function getBackLink(): string {
    if (preselectedServiceEventId) return `/service-events/${preselectedServiceEventId}`;
    if (preselectedParkId) return `/parks/${preselectedParkId}`;
    if (preselectedTurbineId) return `/parks`; // Turbines are now managed within parks
    if (preselectedFundId) return `/funds/${preselectedFundId}`;
    if (preselectedContractId) return `/contracts/${preselectedContractId}`;
    return "/documents";
  }

  async function onSubmit(data: DocumentFormValues) {
    if (!selectedFile) {
      toast.error(t("selectFile"));
      return;
    }

    try {
      setIsLoading(true);

      // Upload file using FormData (multipart) to actually store in S3
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("title", data.title);
      formData.append("category", data.category);
      if (data.description) formData.append("description", data.description);
      if (data.tags.length > 0) formData.append("tags", JSON.stringify(data.tags));
      if (data.parkId && data.parkId !== "_none") formData.append("parkId", data.parkId);
      if (data.fundId && data.fundId !== "_none") formData.append("fundId", data.fundId);
      if (data.contractId && data.contractId !== "_none") formData.append("contractId", data.contractId);
      if (data.shareholderId && data.shareholderId !== "_none") formData.append("shareholderId", data.shareholderId);
      if (data.turbineId && data.turbineId !== "_none") formData.append("turbineId", data.turbineId);
      if (data.serviceEventId && data.serviceEventId !== "_none") formData.append("serviceEventId", data.serviceEventId);

      // Use XMLHttpRequest-based upload for real progress tracking
      const document = await upload("/api/documents", formData) as { id: string };

      // Navigate back to the source page or to the document
      if (preselectedServiceEventId) {
        router.push(`/service-events/${preselectedServiceEventId}`);
      } else if (preselectedParkId) {
        router.push(`/parks/${preselectedParkId}`);
      } else {
        router.push(`/documents/${document.id}`);
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errorSaving"));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={getBackLink()}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">
            {t("description")}
          </p>
        </div>
      </div>

      {preselectedInfo && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>{preselectedInfo}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* File Upload */}
          <Card>
            <CardHeader>
              <CardTitle>{t("fileCard")}</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedFile ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <File className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{selectedFile.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={removeFile}
                      disabled={isFileUploading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {isFileUploading && (
                    <div className="space-y-2">
                      <Progress value={uploadProgress} className="h-2" />
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{t("uploading", { progress: uploadProgress })}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={cancelUpload}
                          className="h-auto py-0 px-2 text-muted-foreground hover:text-destructive"
                        >
                          {t("cancelUpload")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted/70 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="h-10 w-10 text-muted-foreground mb-3" />
                    <p className="mb-2 text-sm text-muted-foreground">
                      <span className="font-semibold">{t("clickToUpload")}</span>{" "}
                      {t("dragDrop")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("fileTypes")}
                    </p>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  />
                </label>
              )}
            </CardContent>
          </Card>

          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>{t("basicInfo")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("titleLabel")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("titlePlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("descriptionLabel")}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t("descriptionPlaceholder")}
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("categoryLabel")}</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("categoryPlaceholder")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categoryKeys.map((key) => (
                          <SelectItem key={key} value={key}>
                            {tCat(key)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Tags */}
              <FormField
                control={form.control}
                name="tags"
                render={() => (
                  <FormItem>
                    <FormLabel>{t("tagsLabel")}</FormLabel>
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {tags.map((tag, index) => (
                          <Badge key={index} variant="secondary">
                            {tag}
                            <button
                              type="button"
                              onClick={() => removeTag(index)}
                              className="ml-2 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Input
                        placeholder={t("tagPlaceholder")}
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTag();
                          }
                        }}
                      />
                      <Button type="button" variant="outline" onClick={addTag}>
                        {t("addTag")}
                      </Button>
                    </div>
                    <FormDescription>
                      {t("tagsHelp")}
                    </FormDescription>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Associations */}
          <Card>
            <CardHeader>
              <CardTitle>{t("assignmentsTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground mb-4">
                {t("assignmentsDescription")}
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Service Event */}
                <FormField
                  control={form.control}
                  name="serviceEventId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("serviceEvent")}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={loadingOptions}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("noServiceEvent")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">{t("noServiceEvent")}</SelectItem>
                          {serviceEvents.map((event) => (
                            <SelectItem key={event.id} value={event.id}>
                              {t(`eventTypes.${event.eventType}`)} - {event.turbineDesignation} ({formatDate(event.eventDate)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                {/* Turbine */}
                <FormField
                  control={form.control}
                  name="turbineId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("turbine")}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={loadingOptions}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("noTurbine")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">{t("noTurbine")}</SelectItem>
                          {turbines.map((turbine) => (
                            <SelectItem key={turbine.id} value={turbine.id}>
                              {turbine.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                {/* Park */}
                <FormField
                  control={form.control}
                  name="parkId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("windpark")}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={loadingOptions}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("noWindpark")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">{t("noWindpark")}</SelectItem>
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

                {/* Fund */}
                <FormField
                  control={form.control}
                  name="fundId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fund")}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={loadingOptions}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("noFund")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">{t("noFund")}</SelectItem>
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
                          {t("newFund")}
                        </Link>
                      </Button>
                    </FormItem>
                  )}
                />

                {/* Contract */}
                <FormField
                  control={form.control}
                  name="contractId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("contract")}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={loadingOptions}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("noContract")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">{t("noContract")}</SelectItem>
                          {contracts.map((contract) => (
                            <SelectItem key={contract.id} value={contract.id}>
                              {contract.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                {/* Shareholder */}
                <FormField
                  control={form.control}
                  name="shareholderId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("shareholderLabel")}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={loadingOptions}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("noShareholder")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">{t("noShareholder")}</SelectItem>
                          {shareholders.map((sh) => (
                            <SelectItem key={sh.id} value={sh.id}>
                              {sh.name}
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

          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(getBackLink())}
              disabled={isLoading}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={isLoading || isFileUploading || !selectedFile}>
              {(isLoading || isFileUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isFileUploading ? t("uploading", { progress: uploadProgress }) : t("uploadButton")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

export default function DocumentUploadPage() {
  return (
    <Suspense fallback={
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 bg-muted animate-pulse rounded" />
          <div>
            <div className="h-8 w-64 bg-muted animate-pulse rounded" />
            <div className="mt-2 h-4 w-32 bg-muted animate-pulse rounded" />
          </div>
        </div>
      </div>
    }>
      <DocumentUploadForm />
    </Suspense>
  );
}
