"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Send,
  Eye,
  TestTube,
  Mail,
  Loader2,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  History,
} from "lucide-react";
import RichTextEditor from "@/components/ui/rich-text-editor-dynamic";

// =============================================================================
// Types
// =============================================================================

type RecipientFilter = "ALL" | "BY_FUND" | "BY_PARK" | "BY_ROLE" | "ACTIVE_ONLY";

interface Recipient {
  id: string;
  name: string;
  email: string;
  fund: string;
}

interface FundOption {
  id: string;
  name: string;
}

interface ParkOption {
  id: string;
  name: string;
}

interface CommunicationHistory {
  id: string;
  subject: string;
  recipientFilter: string;
  recipientCount: number;
  status: string;
  sentAt: string | null;
  createdAt: string;
  createdBy: string;
}

// =============================================================================
// Status badge helper
// =============================================================================

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "QUEUED":
      return (
        <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 border-yellow-200">
          <Clock className="mr-1 h-3 w-3" />
          Warteschlange
        </Badge>
      );
    case "SENDING":
      return (
        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Wird gesendet
        </Badge>
      );
    case "SENT":
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200">
          <CheckCircle className="mr-1 h-3 w-3" />
          Gesendet
        </Badge>
      );
    case "FAILED":
      return (
        <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-red-200">
          <AlertCircle className="mr-1 h-3 w-3" />
          Fehlgeschlagen
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// =============================================================================
// Filter label helper
// =============================================================================

function getFilterLabel(filter: string): string {
  try {
    const parsed = JSON.parse(filter);
    switch (parsed.type) {
      case "ALL":
        return "Alle Gesellschafter";
      case "BY_FUND":
        return "Nach Fonds";
      case "BY_PARK":
        return "Nach Park";
      case "BY_ROLE":
        return "Nach Rolle";
      case "ACTIVE_ONLY":
        return "Nur aktive";
      default:
        return parsed.type || "Unbekannt";
    }
  } catch {
    return filter;
  }
}

// =============================================================================
// Main Page Component
// =============================================================================

export default function MassCommunicationPage() {
  const { toast } = useToast();

  // Form state
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipientFilter, setRecipientFilter] = useState<RecipientFilter>("ALL");
  const [selectedFundIds, setSelectedFundIds] = useState<string[]>([]);
  const [selectedParkIds, setSelectedParkIds] = useState<string[]>([]);

  // Data state
  const [funds, setFunds] = useState<FundOption[]>([]);
  const [parks, setParks] = useState<ParkOption[]>([]);
  const [history, setHistory] = useState<CommunicationHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRecipients, setPreviewRecipients] = useState<Recipient[]>([]);
  const [previewCount, setPreviewCount] = useState(0);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Send state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  const loadFundsAndParks = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const [fundsRes, parksRes] = await Promise.all([
        fetch("/api/funds?limit=100"),
        fetch("/api/parks?limit=100"),
      ]);

      if (fundsRes.ok) {
        const fundsData = await fundsRes.json();
        const fundsList = fundsData.funds || fundsData.data || fundsData || [];
        setFunds(
          Array.isArray(fundsList)
            ? fundsList.map((f: { id: string; name: string }) => ({
                id: f.id,
                name: f.name,
              }))
            : []
        );
      }

      if (parksRes.ok) {
        const parksData = await parksRes.json();
        const parksList = parksData.parks || parksData.data || parksData || [];
        setParks(
          Array.isArray(parksList)
            ? parksList.map((p: { id: string; name: string }) => ({
                id: p.id,
                name: p.name,
              }))
            : []
        );
      }
    } catch (error) {
      console.error("Failed to load funds/parks:", error);
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/admin/mass-communication?limit=20");
      if (res.ok) {
        const data = await res.json();
        setHistory(data.communications || []);
      }
    } catch (error) {
      console.error("Failed to load history:", error);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadFundsAndParks();
    loadHistory();
  }, [loadFundsAndParks, loadHistory]);

  // -------------------------------------------------------------------------
  // Preview
  // -------------------------------------------------------------------------

  const handlePreview = async () => {
    setLoadingPreview(true);
    setPreviewOpen(true);

    try {
      const res = await fetch("/api/admin/mass-communication/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientFilter,
          fundIds: recipientFilter === "BY_FUND" ? selectedFundIds : undefined,
          parkIds: recipientFilter === "BY_PARK" ? selectedParkIds : undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPreviewRecipients(data.recipients || []);
        setPreviewCount(data.totalCount || 0);
      } else {
        const errData = await res.json();
        toast({
          title: "Fehler",
          description: errData.error || "Vorschau konnte nicht geladen werden",
          variant: "destructive",
        });
        setPreviewOpen(false);
      }
    } catch {
      toast({
        title: "Fehler",
        description: "Verbindungsfehler bei der Vorschau",
        variant: "destructive",
      });
      setPreviewOpen(false);
    } finally {
      setLoadingPreview(false);
    }
  };

  // -------------------------------------------------------------------------
  // Send test
  // -------------------------------------------------------------------------

  const handleSendTest = async () => {
    if (!subject.trim() || !body.trim()) {
      toast({
        title: "Fehlende Angaben",
        description: "Bitte geben Sie Betreff und Nachricht ein.",
        variant: "destructive",
      });
      return;
    }

    setSendingTest(true);

    try {
      const res = await fetch("/api/admin/mass-communication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          body,
          recipientFilter,
          fundIds: recipientFilter === "BY_FUND" ? selectedFundIds : undefined,
          parkIds: recipientFilter === "BY_PARK" ? selectedParkIds : undefined,
          sendTest: true,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast({
          title: "Test-E-Mail gesendet",
          description: data.message || "Die Test-E-Mail wurde erfolgreich gesendet.",
        });
      } else {
        toast({
          title: "Fehler",
          description: data.error || "Test-E-Mail konnte nicht gesendet werden",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Fehler",
        description: "Verbindungsfehler beim Senden der Test-E-Mail",
        variant: "destructive",
      });
    } finally {
      setSendingTest(false);
    }
  };

  // -------------------------------------------------------------------------
  // Send to all
  // -------------------------------------------------------------------------

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      toast({
        title: "Fehlende Angaben",
        description: "Bitte geben Sie Betreff und Nachricht ein.",
        variant: "destructive",
      });
      return;
    }

    setConfirmOpen(true);
  };

  const confirmSend = async () => {
    setConfirmOpen(false);
    setSending(true);

    try {
      const res = await fetch("/api/admin/mass-communication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          body,
          recipientFilter,
          fundIds: recipientFilter === "BY_FUND" ? selectedFundIds : undefined,
          parkIds: recipientFilter === "BY_PARK" ? selectedParkIds : undefined,
          sendTest: false,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        toast({
          title: "E-Mails gesendet",
          description: data.message || `${data.recipientCount} E-Mails wurden gesendet.`,
        });

        // Reset form
        setSubject("");
        setBody("");
        setRecipientFilter("ALL");
        setSelectedFundIds([]);
        setSelectedParkIds([]);

        // Reload history
        loadHistory();
      } else {
        toast({
          title: "Fehler",
          description: data.error || "E-Mails konnten nicht gesendet werden",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Fehler",
        description: "Verbindungsfehler beim Senden",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  // -------------------------------------------------------------------------
  // Fund/Park selection helpers
  // -------------------------------------------------------------------------

  const toggleFund = (fundId: string) => {
    setSelectedFundIds((prev) =>
      prev.includes(fundId)
        ? prev.filter((id) => id !== fundId)
        : [...prev, fundId]
    );
  };

  const togglePark = (parkId: string) => {
    setSelectedParkIds((prev) =>
      prev.includes(parkId)
        ? prev.filter((id) => id !== parkId)
        : [...prev, parkId]
    );
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const isFormValid = subject.trim().length > 0 && body.trim().length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Massen-Kommunikation"
        description="E-Mails an Gesellschafter senden, gefiltert nach verschiedenen Kriterien."
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ============================================================= */}
        {/* Left side: Compose Form */}
        {/* ============================================================= */}
        <div className="xl:col-span-2 space-y-6">
          {/* Subject and Body */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Nachricht verfassen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subject">Betreff</Label>
                <Input
                  id="subject"
                  placeholder="E-Mail Betreff eingeben..."
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={200}
                />
              </div>

              <div className="space-y-2">
                <Label>Nachricht</Label>
                <RichTextEditor
                  value={body}
                  onChange={setBody}
                  placeholder="Ihre Nachricht an die Gesellschafter..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Recipient Filter */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Empfaenger
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup
                value={recipientFilter}
                onValueChange={(val) => {
                  setRecipientFilter(val as RecipientFilter);
                  // Clear selections when filter type changes
                  setSelectedFundIds([]);
                  setSelectedParkIds([]);
                }}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="ALL" id="filter-all" />
                  <Label htmlFor="filter-all" className="cursor-pointer">
                    Alle Gesellschafter
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="ACTIVE_ONLY" id="filter-active" />
                  <Label htmlFor="filter-active" className="cursor-pointer">
                    Nur aktive Gesellschafter (ohne Austritt)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="BY_FUND" id="filter-fund" />
                  <Label htmlFor="filter-fund" className="cursor-pointer">
                    Nach Fonds filtern
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="BY_PARK" id="filter-park" />
                  <Label htmlFor="filter-park" className="cursor-pointer">
                    Nach Windpark filtern
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="BY_ROLE" id="filter-role" />
                  <Label htmlFor="filter-role" className="cursor-pointer">
                    Nur aktive (nach Status)
                  </Label>
                </div>
              </RadioGroup>

              {/* Fund multi-select */}
              {recipientFilter === "BY_FUND" && (
                <div className="mt-4 space-y-2">
                  <Label>Fonds auswaehlen</Label>
                  {loadingOptions ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-6 w-48" />
                      ))}
                    </div>
                  ) : funds.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Keine Fonds gefunden.
                    </p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto rounded-md border p-3 space-y-2">
                      {funds.map((fund) => (
                        <div key={fund.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`fund-${fund.id}`}
                            checked={selectedFundIds.includes(fund.id)}
                            onCheckedChange={() => toggleFund(fund.id)}
                          />
                          <Label
                            htmlFor={`fund-${fund.id}`}
                            className="cursor-pointer text-sm"
                          >
                            {fund.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedFundIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {selectedFundIds.length} Fonds ausgewaehlt
                    </p>
                  )}
                </div>
              )}

              {/* Park multi-select */}
              {recipientFilter === "BY_PARK" && (
                <div className="mt-4 space-y-2">
                  <Label>Windparks auswaehlen</Label>
                  {loadingOptions ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-6 w-48" />
                      ))}
                    </div>
                  ) : parks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Keine Windparks gefunden.
                    </p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto rounded-md border p-3 space-y-2">
                      {parks.map((park) => (
                        <div key={park.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`park-${park.id}`}
                            checked={selectedParkIds.includes(park.id)}
                            onCheckedChange={() => togglePark(park.id)}
                          />
                          <Label
                            htmlFor={`park-${park.id}`}
                            className="cursor-pointer text-sm"
                          >
                            {park.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedParkIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {selectedParkIds.length} Windparks ausgewaehlt
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={handlePreview}
              disabled={loadingPreview}
            >
              {loadingPreview ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Eye className="mr-2 h-4 w-4" />
              )}
              Vorschau
            </Button>

            <Button
              variant="outline"
              onClick={handleSendTest}
              disabled={!isFormValid || sendingTest}
            >
              {sendingTest ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <TestTube className="mr-2 h-4 w-4" />
              )}
              Test senden
            </Button>

            <Button
              onClick={handleSend}
              disabled={!isFormValid || sending}
            >
              {sending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Versenden
            </Button>
          </div>
        </div>

        {/* ============================================================= */}
        {/* Right side: History */}
        {/* ============================================================= */}
        <div className="xl:col-span-1">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Verlauf
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={loadHistory}
                  disabled={loadingHistory}
                  title="Aktualisieren"
                  aria-label="Verlauf aktualisieren"
                >
                  <RefreshCw className={`h-4 w-4 ${loadingHistory ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingHistory ? (
                <div className="space-y-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-2/3" />
                      <Skeleton className="h-5 w-20" />
                    </div>
                  ))}
                </div>
              ) : history.length === 0 ? (
                <EmptyState
                  icon={Mail}
                  title="Keine Nachrichten"
                  description="Es wurden noch keine Massen-Kommunikationen versendet."
                />
              ) : (
                <div className="space-y-4">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-md border p-3 space-y-2 hover:bg-muted/50 transition-colors"
                    >
                      <div className="font-medium text-sm line-clamp-2">
                        {item.subject}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Users className="h-3 w-3" />
                        {item.recipientCount} Empfaenger
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(item.createdAt).toLocaleDateString("de-DE", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      <div className="flex items-center justify-between">
                        <StatusBadge status={item.status} />
                        <span className="text-xs text-muted-foreground">
                          {getFilterLabel(item.recipientFilter)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ================================================================= */}
      {/* Preview Dialog */}
      {/* ================================================================= */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Empfaenger-Vorschau</DialogTitle>
            <DialogDescription>
              {loadingPreview
                ? "Empfaenger werden geladen..."
                : `${previewCount} Empfaenger gefunden`}
            </DialogDescription>
          </DialogHeader>

          {loadingPreview ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : previewRecipients.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              Keine Empfaenger fuer die gewaehlten Filter-Kriterien gefunden.
            </div>
          ) : (
            <div className="overflow-y-auto flex-1">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>E-Mail</TableHead>
                    <TableHead>Fonds</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRecipients.map((recipient) => (
                    <TableRow key={recipient.id}>
                      <TableCell className="font-medium">
                        {recipient.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.email}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {recipient.fund}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* Confirmation Dialog */}
      {/* ================================================================= */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>E-Mails versenden?</AlertDialogTitle>
            <AlertDialogDescription>
              Sind Sie sicher, dass Sie diese Nachricht versenden moechten?
              Die E-Mail wird basierend auf den gewaehlten Filtern an alle
              passenden Empfaenger gesendet. Dieser Vorgang kann nicht
              rueckgaengig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-md bg-muted p-3 text-sm space-y-1">
            <div>
              <span className="font-medium">Betreff:</span> {subject}
            </div>
            <div>
              <span className="font-medium">Filter:</span>{" "}
              {recipientFilter === "ALL" && "Alle Gesellschafter"}
              {recipientFilter === "ACTIVE_ONLY" && "Nur aktive Gesellschafter"}
              {recipientFilter === "BY_FUND" &&
                `Nach Fonds (${selectedFundIds.length} ausgewaehlt)`}
              {recipientFilter === "BY_PARK" &&
                `Nach Park (${selectedParkIds.length} ausgewaehlt)`}
              {recipientFilter === "BY_ROLE" && "Nur aktive (nach Status)"}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSend}>
              <Send className="mr-2 h-4 w-4" />
              Jetzt versenden
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
