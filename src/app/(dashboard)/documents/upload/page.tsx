"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Loader2, Upload, File, X, Info, Plus } from "lucide-react";
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
  title: z.string().min(1, "Titel ist erforderlich"),
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

const categoryOptions = [
  { value: "CONTRACT", label: "Vertrag" },
  { value: "PROTOCOL", label: "Protokoll" },
  { value: "REPORT", label: "Bericht" },
  { value: "INVOICE", label: "Rechnung" },
  { value: "PERMIT", label: "Genehmigung" },
  { value: "CORRESPONDENCE", label: "Korrespondenz" },
  { value: "OTHER", label: "Sonstiges" },
];

const eventTypeLabels: Record<string, string> = {
  MAINTENANCE: "Wartung",
  REPAIR: "Reparatur",
  INSPECTION: "Inspektion",
  BLADE_INSPECTION: "Rotorblatt-Inspektion",
  GEARBOX_SERVICE: "Getriebe-Service",
  GENERATOR_SERVICE: "Generator-Service",
  SOFTWARE_UPDATE: "Software-Update",
  EMERGENCY: "Notfall",
  OTHER: "Sonstiges",
};

function DocumentUploadForm() {
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
    resolver: zodResolver(documentFormSchema),
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data.data.map((p: any) => ({ id: p.id, name: p.shortName || p.name }))
          );
        }
        if (fundsRes.ok) {
          const data = await fundsRes.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setFunds(data.data.map((f: any) => ({ id: f.id, name: f.name })));
        }
        if (contractsRes.ok) {
          const data = await contractsRes.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setContracts(data.data.map((c: any) => ({ id: c.id, name: c.title })));
        }
        if (shareholdersRes.ok) {
          const data = await shareholdersRes.json();
          setShareholders(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data.data.map((s: any) => ({ id: s.id, name: s.person?.name || s.id }))
          );
        }
        if (turbinesRes.ok) {
          const data = await turbinesRes.json();
          setTurbines(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data.data.map((t: any) => ({
              id: t.id,
              name: `${t.designation}${t.park?.shortName ? ` (${t.park.shortName})` : ""}`
            }))
          );
        }
        if (serviceEventsRes.ok) {
          const data = await serviceEventsRes.json();
          setServiceEvents(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data.data.map((e: any) => ({
              id: e.id,
              eventType: e.eventType,
              eventDate: e.eventDate,
              turbineDesignation: e.turbine?.designation || "Unbekannt",
            }))
          );
        }

        // Build preselection info message
        const infoParts: string[] = [];
        if (preselectedServiceEventId) {
          const event = serviceEventsRes.ok
            ? (await serviceEventsRes.json()).data?.find((e: any) => e.id === preselectedServiceEventId)
            : null;
          if (event) {
            infoParts.push(`Service-Event: ${eventTypeLabels[event.eventType] || event.eventType} (${event.turbine?.designation})`);
          } else {
            infoParts.push("Service-Event");
          }
        }
        if (preselectedTurbineId) infoParts.push("Anlage");
        if (preselectedParkId) infoParts.push("Windpark");
        if (preselectedFundId) infoParts.push("Gesellschaft");
        if (preselectedContractId) infoParts.push("Vertrag");
        if (preselectedShareholderId) infoParts.push("Gesellschafter");

        if (infoParts.length > 0) {
          setPreselectedInfo(`Vorausgewählt: ${infoParts.join(", ")}`);
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
      toast.error("Bitte waehlen Sie eine Datei aus");
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
      toast.error(error instanceof Error ? error.message : "Fehler beim Speichern");
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
          <h1 className="text-3xl font-bold tracking-tight">Dokument hochladen</h1>
          <p className="text-muted-foreground">
            Laden Sie ein neues Dokument hoch
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
              <CardTitle>Datei</CardTitle>
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
                        <span>Wird hochgeladen... {uploadProgress}%</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={cancelUpload}
                          className="h-auto py-0 px-2 text-muted-foreground hover:text-destructive"
                        >
                          Abbrechen
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
                      <span className="font-semibold">Klicken zum Hochladen</span>{" "}
                      oder Drag & Drop
                    </p>
                    <p className="text-xs text-muted-foreground">
                      PDF, DOCX, XLSX, Bilder (max. 50MB)
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
              <CardTitle>Basis-Informationen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Titel *</FormLabel>
                    <FormControl>
                      <Input placeholder="Dokumenttitel" {...field} />
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
                    <FormLabel>Beschreibung</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Optionale Beschreibung des Dokuments..."
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
                    <FormLabel>Kategorie *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Kategorie wählen" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categoryOptions.map((option) => (
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

              {/* Tags */}
              <FormField
                control={form.control}
                name="tags"
                render={() => (
                  <FormItem>
                    <FormLabel>Tags</FormLabel>
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
                        placeholder="Neuen Tag hinzufügen"
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
                        Hinzufügen
                      </Button>
                    </div>
                    <FormDescription>
                      Tags helfen beim Organisieren und Finden von Dokumenten
                    </FormDescription>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Associations */}
          <Card>
            <CardHeader>
              <CardTitle>Zuordnungen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground mb-4">
                Verknüpfen Sie das Dokument optional mit Entitäten
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                {/* Service Event */}
                <FormField
                  control={form.control}
                  name="serviceEventId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service-Event</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={loadingOptions}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Kein Service-Event" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">Kein Service-Event</SelectItem>
                          {serviceEvents.map((event) => (
                            <SelectItem key={event.id} value={event.id}>
                              {eventTypeLabels[event.eventType] || event.eventType} - {event.turbineDesignation} ({new Date(event.eventDate).toLocaleDateString("de-DE")})
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
                      <FormLabel>Anlage</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={loadingOptions}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Keine Anlage" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">Keine Anlage</SelectItem>
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
                      <FormLabel>Windpark</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={loadingOptions}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Kein Windpark" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">Kein Windpark</SelectItem>
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
                      <FormLabel>Gesellschaft</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={loadingOptions}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Keine Gesellschaft" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">Keine Gesellschaft</SelectItem>
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
                          Neue Gesellschaft anlegen
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
                      <FormLabel>Vertrag</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={loadingOptions}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Kein Vertrag" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">Kein Vertrag</SelectItem>
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
                      <FormLabel>Gesellschafter</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={loadingOptions}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Kein Gesellschafter" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="_none">Kein Gesellschafter</SelectItem>
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
              Abbrechen
            </Button>
            <Button type="submit" disabled={isLoading || isFileUploading || !selectedFile}>
              {(isLoading || isFileUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isFileUploading ? `Wird hochgeladen... ${uploadProgress}%` : "Hochladen"}
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
