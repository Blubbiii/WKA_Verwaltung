"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  FileSignature,
  Plus,
  Users,
  UserCheck,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { ProxyDocumentUpload } from "@/components/votes/proxy-document-upload";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";

// Types
interface Proxy {
  id: string;
  type: "GENERAL" | "SINGLE";
  status: "ACTIVE" | "REVOKED";
  createdAt: string;
  revokedAt: string | null;
  documentUrl: string | null;
  grantor: {
    id: string;
    name: string;
    email: string;
  };
  grantee: {
    id: string;
    name: string;
    email: string;
  };
  vote?: {
    id: string;
    title: string;
  } | null;
  fund: {
    id: string;
    name: string;
  };
}

interface Vote {
  id: string;
  title: string;
  deadline: string;
  fund: {
    id: string;
    name: string;
  };
}

interface Shareholder {
  id: string;
  name: string;
  email: string;
  fundId: string;
  fundName: string;
}

interface ProxiesData {
  granted: Proxy[];
  received: Proxy[];
}

// Status colors only — labels via i18n
const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  REVOKED: "bg-gray-100 text-gray-800",
};

export default function ProxiesPage() {
  const t = useTranslations("portal.proxies");
  const tStatus = useTranslations("portal.proxies.status");
  const tType = useTranslations("portal.proxies.type");
  const translateStatus = (key: string) => {
    try { return tStatus(key as "ACTIVE"); } catch { return key; }
  };
  const [proxies, setProxies] = useState<ProxiesData>({ granted: [], received: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [shareholders, setShareholders] = useState<Shareholder[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Form state
  const [selectedGrantee, setSelectedGrantee] = useState<string>("");
  const [proxyType, setProxyType] = useState<"GENERAL" | "SINGLE">("GENERAL");
  const [selectedVote, setSelectedVote] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Revoke state
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [proxyToRevoke, setProxyToRevoke] = useState<string | null>(null);

  // Fetch proxies
  const fetchProxies = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch("/api/portal/my-proxies");
      if (!response.ok) {
        throw new Error(t("loadError"));
      }
      const data = await response.json();
      setProxies(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("unknownError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Fetch shareholders and votes for the dialog
  const fetchDialogOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      // Fetch participations to get other shareholders
      const [participationsRes, votesRes] = await Promise.all([
        fetch("/api/portal/my-participations"),
        fetch("/api/portal/my-votes"),
      ]);

      if (participationsRes.ok) {
        const participationsData = await participationsRes.json();
        // Extract other shareholders from participations
        const otherShareholders: Shareholder[] = [];

        if (participationsData.data) {
          for (const participation of participationsData.data) {
            if (participation.otherShareholders) {
              for (const sh of participation.otherShareholders) {
                otherShareholders.push({
                  id: sh.id,
                  name: sh.name,
                  email: sh.email,
                  fundId: participation.fund.id,
                  fundName: participation.fund.name,
                });
              }
            }
          }
        }
        setShareholders(otherShareholders);
      }

      if (votesRes.ok) {
        const votesData = await votesRes.json();
        // Filter to only active votes
        const activeVotes = (votesData.data || []).filter(
          (v: Vote & { status: string }) => v.status === "ACTIVE"
        );
        setVotes(activeVotes);
      }
    } catch {
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  useEffect(() => {
    fetchProxies();
  }, [fetchProxies]);

  // Open dialog handler
  const handleOpenDialog = () => {
    setDialogOpen(true);
    fetchDialogOptions();
    // Reset form
    setSelectedGrantee("");
    setProxyType("GENERAL");
    setSelectedVote("");
    setFormError(null);
  };

  // Submit new proxy
  const handleSubmit = async () => {
    setFormError(null);

    if (!selectedGrantee) {
      setFormError(t("dialog.selectGranteeError"));
      return;
    }

    if (proxyType === "SINGLE" && !selectedVote) {
      setFormError(t("dialog.selectVoteError"));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/portal/my-proxies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          granteeId: selectedGrantee,
          type: proxyType,
          voteId: proxyType === "SINGLE" ? selectedVote : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || t("dialog.createError"));
      }

      setDialogOpen(false);
      fetchProxies();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("unknownError"));
    } finally {
      setSubmitting(false);
    }
  };

  // Revoke proxy
  const handleRevoke = (proxyId: string) => {
    setProxyToRevoke(proxyId);
    setRevokeDialogOpen(true);
  };

  const handleConfirmRevoke = async () => {
    if (!proxyToRevoke) return;

    setRevoking(proxyToRevoke);
    try {
      const response = await fetch(`/api/portal/my-proxies/${proxyToRevoke}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(t("revokeDialog.revokeError"));
      }

      fetchProxies();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("unknownError"));
    } finally {
      setRevoking(null);
      setRevokeDialogOpen(false);
      setProxyToRevoke(null);
    }
  };

  // Get proxy type display text
  const getProxyTypeDisplay = (proxy: Proxy) => {
    if (proxy.type === "GENERAL") {
      return tType("GENERAL");
    }
    return proxy.vote
      ? tType("singleFor", { title: proxy.vote.title })
      : tType("SINGLE");
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t("loadError")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={() => { setLoading(true); fetchProxies(); }}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  const grantedCount = proxies.granted.length;
  const receivedCount = proxies.received.length;
  const activeGrantedCount = proxies.granted.filter((p) => p.status === "ACTIVE").length;
  const activeReceivedCount = proxies.received.filter((p) => p.status === "ACTIVE").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenDialog}>
              <Plus className="mr-2 h-4 w-4" />
              {t("newProxy")}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{t("dialog.title")}</DialogTitle>
              <DialogDescription>
                {t("dialog.description")}
              </DialogDescription>
            </DialogHeader>

            {loadingOptions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-6 py-4">
                {formError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}

                {/* Grantee Selection */}
                <div className="space-y-2">
                  <Label htmlFor="grantee">{t("dialog.grantee")}</Label>
                  <Select
                    value={selectedGrantee}
                    onValueChange={setSelectedGrantee}
                  >
                    <SelectTrigger id="grantee">
                      <SelectValue placeholder={t("dialog.granteePlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {shareholders.length === 0 ? (
                        <SelectItem value="_empty" disabled>
                          {t("dialog.noShareholders")}
                        </SelectItem>
                      ) : (
                        shareholders.map((sh) => (
                          <SelectItem key={sh.id} value={sh.id}>
                            {sh.name} ({sh.fundName})
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Proxy Type Selection */}
                <div className="space-y-3">
                  <Label>{t("dialog.proxyType")}</Label>
                  <RadioGroup
                    value={proxyType}
                    onValueChange={(value) => setProxyType(value as "GENERAL" | "SINGLE")}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="GENERAL" id="general" />
                      <Label htmlFor="general" className="font-normal cursor-pointer">
                        {t("dialog.generalLabel")}
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="SINGLE" id="single" />
                      <Label htmlFor="single" className="font-normal cursor-pointer">
                        {t("dialog.singleLabel")}
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Vote Selection (only for single proxy) */}
                {proxyType === "SINGLE" && (
                  <div className="space-y-2">
                    <Label htmlFor="vote">{t("dialog.vote")}</Label>
                    <Select
                      value={selectedVote}
                      onValueChange={setSelectedVote}
                    >
                      <SelectTrigger id="vote">
                        <SelectValue placeholder={t("dialog.votePlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {votes.length === 0 ? (
                          <SelectItem value="_empty" disabled>
                            {t("dialog.noActiveVotes")}
                          </SelectItem>
                        ) : (
                          votes.map((vote) => (
                            <SelectItem key={vote.id} value={vote.id}>
                              {vote.title} ({vote.fund.name})
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
              >
                {t("dialog.cancel")}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || loadingOptions}
              >
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("dialog.submit")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.granted")}</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeGrantedCount}</div>
            <p className="text-xs text-muted-foreground">
              {t("stats.totalRevoked", { total: grantedCount, revoked: grantedCount - activeGrantedCount })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t("stats.received")}</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeReceivedCount}</div>
            <p className="text-xs text-muted-foreground">
              {t("stats.totalRevoked", { total: receivedCount, revoked: receivedCount - activeReceivedCount })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="granted">
        <TabsList>
          <TabsTrigger value="granted">
            <FileSignature className="mr-2 h-4 w-4" />
            {t("tabs.granted", { count: grantedCount })}
          </TabsTrigger>
          <TabsTrigger value="received">
            <UserCheck className="mr-2 h-4 w-4" />
            {t("tabs.received", { count: receivedCount })}
          </TabsTrigger>
        </TabsList>

        {/* Granted Proxies Tab */}
        <TabsContent value="granted" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("granted.title")}</CardTitle>
              <CardDescription>
                {t("granted.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {proxies.granted.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <FileSignature className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>{t("granted.empty")}</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={handleOpenDialog}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t("granted.createFirst")}
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("table.grantee")}</TableHead>
                      <TableHead>{t("table.type")}</TableHead>
                      <TableHead>{t("table.fund")}</TableHead>
                      <TableHead>{t("table.grantedAt")}</TableHead>
                      <TableHead>{t("table.document")}</TableHead>
                      <TableHead>{t("table.status")}</TableHead>
                      <TableHead className="text-right">{t("table.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {proxies.granted.map((proxy) => (
                      <TableRow key={proxy.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{proxy.grantee.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {proxy.grantee.email}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{getProxyTypeDisplay(proxy)}</TableCell>
                        <TableCell>{proxy.fund.name}</TableCell>
                        <TableCell>
                          {format(new Date(proxy.createdAt), "dd.MM.yyyy", {
                            locale: de,
                          })}
                        </TableCell>
                        <TableCell>
                          <ProxyDocumentUpload
                            proxyId={proxy.id}
                            hasDocument={!!proxy.documentUrl}
                            compact
                            onUploadSuccess={fetchProxies}
                            onDeleteSuccess={fetchProxies}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[proxy.status]}>
                            {translateStatus(proxy.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {proxy.status === "ACTIVE" && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleRevoke(proxy.id)}
                              disabled={revoking === proxy.id}
                            >
                              {revoking === proxy.id && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              )}
                              {t("table.revoke")}
                            </Button>
                          )}
                          {proxy.status === "REVOKED" && proxy.revokedAt && (
                            <span className="text-sm text-muted-foreground">
                              {t("table.revokedOn", { date: format(new Date(proxy.revokedAt), "dd.MM.yyyy", { locale: de }) })}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Received Proxies Tab */}
        <TabsContent value="received" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("received.title")}</CardTitle>
              <CardDescription>
                {t("received.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {proxies.received.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <UserCheck className="mx-auto h-12 w-12 mb-4 opacity-50" />
                  <p>{t("received.empty")}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("table.grantor")}</TableHead>
                      <TableHead>{t("table.type")}</TableHead>
                      <TableHead>{t("table.fund")}</TableHead>
                      <TableHead>{t("table.grantedAt")}</TableHead>
                      <TableHead>{t("table.status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {proxies.received.map((proxy) => (
                      <TableRow key={proxy.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{proxy.grantor.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {proxy.grantor.email}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{getProxyTypeDisplay(proxy)}</TableCell>
                        <TableCell>{proxy.fund.name}</TableCell>
                        <TableCell>
                          {format(new Date(proxy.createdAt), "dd.MM.yyyy", {
                            locale: de,
                          })}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[proxy.status]}>
                            {translateStatus(proxy.status)}
                          </Badge>
                          {proxy.status === "REVOKED" && proxy.revokedAt && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {t("table.onDate", { date: format(new Date(proxy.revokedAt), "dd.MM.yyyy", { locale: de }) })}
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Revoke Confirmation Dialog */}
      <DeleteConfirmDialog
        open={revokeDialogOpen}
        onOpenChange={setRevokeDialogOpen}
        onConfirm={handleConfirmRevoke}
        title={t("revokeDialog.title")}
        description={t("revokeDialog.description")}
      />
    </div>
  );
}
