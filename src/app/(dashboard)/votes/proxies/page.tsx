"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
  Plus,
  Search,
  UserCheck,
  Users,
  FileText,
  MoreHorizontal,
  Eye,
  XCircle,
  Filter,
  CheckCircle,
  Clock,
  AlertCircle,
  Download,
  Upload,
  Loader2,
} from "lucide-react";
import { ProxyDocumentUpload } from "@/components/votes/proxy-document-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Proxy {
  id: string;
  grantor: {
    id: string;
    shareholderNumber: string | null;
    name: string;
  };
  grantee: {
    id: string;
    shareholderNumber: string | null;
    name: string;
  };
  vote: {
    id: string;
    title: string;
    status: string;
  } | null;
  fund: {
    id: string;
    name: string;
  };
  isGeneralProxy: boolean;
  validFrom: string;
  validUntil: string | null;
  isActive: boolean;
  documentUrl: string | null;
  createdAt: string;
}

interface Fund {
  id: string;
  name: string;
}

export default function ProxiesPage() {
  const [proxies, setProxies] = useState<Proxy[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fundFilter, setFundFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [proxyToRevoke, setProxyToRevoke] = useState<string | null>(null);

  useEffect(() => {
    fetchFunds();
    fetchProxies();
  }, [fundFilter, statusFilter]);

  async function fetchFunds() {
    try {
      const response = await fetch("/api/funds?limit=100");
      if (response.ok) {
        const data = await response.json();
        setFunds(data.data);
      }
    } catch {
    }
  }

  async function fetchProxies() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (fundFilter !== "all") params.set("fundId", fundFilter);
      if (statusFilter !== "all") params.set("isActive", statusFilter);

      const response = await fetch(`/api/proxies?${params}`);
      if (!response.ok) throw new Error("Fehler beim Laden");

      const data = await response.json();
      setProxies(data.data);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  function revokeProxy(id: string) {
    setProxyToRevoke(id);
    setRevokeDialogOpen(true);
  }

  async function handleConfirmRevoke() {
    if (!proxyToRevoke) return;

    try {
      const response = await fetch(`/api/proxies/${proxyToRevoke}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      });

      if (response.ok) {
        fetchProxies();
      }
    } catch {
    } finally {
      setRevokeDialogOpen(false);
      setProxyToRevoke(null);
    }
  }

  const filteredProxies = proxies.filter((proxy) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      proxy.grantor.name.toLowerCase().includes(searchLower) ||
      proxy.grantee.name.toLowerCase().includes(searchLower) ||
      proxy.fund.name.toLowerCase().includes(searchLower)
    );
  });

  // Stats
  const activeProxies = proxies.filter((p) => p.isActive);
  const generalProxies = proxies.filter((p) => p.isGeneralProxy && p.isActive);
  const voteSpecificProxies = proxies.filter((p) => !p.isGeneralProxy && p.isActive);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vollmachten</h1>
          <p className="text-muted-foreground">
            Verwalten Sie Stimmrechtsvollmachten für Gesellschafterabstimmungen
          </p>
        </div>
        <Button asChild>
          <Link href="/votes/proxies/new">
            <Plus className="mr-2 h-4 w-4" />
            Neue Vollmacht
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gesamt</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{proxies.length}</div>
            <p className="text-xs text-muted-foreground">Vollmachten</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aktiv</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {activeProxies.length}
            </div>
            <p className="text-xs text-muted-foreground">Gültige Vollmachten</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Generalvollmachten</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{generalProxies.length}</div>
            <p className="text-xs text-muted-foreground">Für alle Abstimmungen</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Einzelvollmachten</CardTitle>
            <UserCheck className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{voteSpecificProxies.length}</div>
            <p className="text-xs text-muted-foreground">Für einzelne Abstimmungen</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Table */}
      <Card>
        <CardHeader>
          <CardTitle>Alle Vollmachten</CardTitle>
          <CardDescription>Übersicht aller erteilten Stimmrechtsvollmachten</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suchen nach Name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={fundFilter} onValueChange={setFundFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Gesellschaft" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Gesellschaften</SelectItem>
                {funds.map((fund) => (
                  <SelectItem key={fund.id} value={fund.id}>
                    {fund.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="true">Aktiv</SelectItem>
                <SelectItem value="false">Widerrufen</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vollmachtgeber</TableHead>
                  <TableHead>Vollmachtnehmer</TableHead>
                  <TableHead>Gesellschaft</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Gültig ab</TableHead>
                  <TableHead>Dokument</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-5 w-20" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredProxies.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      Keine Vollmachten gefunden
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProxies.map((proxy) => (
                    <TableRow key={proxy.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{proxy.grantor.name}</p>
                          {proxy.grantor.shareholderNumber && (
                            <p className="text-sm text-muted-foreground font-mono">
                              {proxy.grantor.shareholderNumber}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{proxy.grantee.name}</p>
                          {proxy.grantee.shareholderNumber && (
                            <p className="text-sm text-muted-foreground font-mono">
                              {proxy.grantee.shareholderNumber}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{proxy.fund.name}</TableCell>
                      <TableCell>
                        {proxy.isGeneralProxy ? (
                          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                            Generalvollmacht
                          </Badge>
                        ) : (
                          <div>
                            <Badge variant="outline">Einzelvollmacht</Badge>
                            {proxy.vote && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {proxy.vote.title}
                              </p>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p>{format(new Date(proxy.validFrom), "dd.MM.yyyy", { locale: de })}</p>
                          {proxy.validUntil && (
                            <p className="text-muted-foreground">
                              bis {format(new Date(proxy.validUntil), "dd.MM.yyyy", { locale: de })}
                            </p>
                          )}
                        </div>
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
                        {proxy.isActive ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-800">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Aktiv
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-gray-100 text-gray-800">
                            <XCircle className="mr-1 h-3 w-3" />
                            Widerrufen
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/votes/proxies/${proxy.id}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                Details
                              </Link>
                            </DropdownMenuItem>
                            {proxy.documentUrl && (
                              <DropdownMenuItem asChild>
                                <a
                                  href={proxy.documentUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <FileText className="mr-2 h-4 w-4" />
                                  Dokument anzeigen
                                </a>
                              </DropdownMenuItem>
                            )}
                            {proxy.isActive && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => revokeProxy(proxy.id)}
                                  className="text-red-600"
                                >
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Widerrufen
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Revoke Confirmation Dialog */}
      <DeleteConfirmDialog
        open={revokeDialogOpen}
        onOpenChange={setRevokeDialogOpen}
        onConfirm={handleConfirmRevoke}
        title="Widerruf bestaetigen"
        description="Moechten Sie diese Vollmacht wirklich widerrufen?"
      />
    </div>
  );
}
