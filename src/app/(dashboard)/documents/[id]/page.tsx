"use client";

import { useState, useEffect } from "react";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  ArrowLeft,
  Download,
  Pencil,
  Upload,
  Archive,
  FileText,
  File,
  FileSpreadsheet,
  FileImage,
  History,
  ExternalLink,
  Tag,
  Eye,
  SendHorizontal,
  CheckCircle2,
  XCircle,
  Globe,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { DocumentPreviewDialog } from "@/components/documents";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface DocumentVersion {
  id: string;
  version: number;
  fileName: string;
  fileUrl: string;
  fileSizeBytes: number | null;
  createdAt: string;
  uploadedBy: string | null;
  isCurrent: boolean;
}

interface DocumentDetail {
  id: string;
  title: string;
  description: string | null;
  category: string;
  fileName: string;
  fileUrl: string;
  fileSizeBytes: number | null;
  mimeType: string | null;
  version: number;
  tags: string[];
  isArchived: boolean;
  approvalStatus: string;
  reviewedBy: { name: string; email: string } | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  publishedAt: string | null;
  park: { id: string; name: string; shortName: string | null } | null;
  fund: { id: string; name: string } | null;
  turbine: { id: string; designation: string } | null;
  contract: { id: string; title: string } | null;
  shareholder: { id: string; name: string } | null;
  uploadedBy: { name: string; email: string } | null;
  versions: DocumentVersion[];
  createdAt: string;
  updatedAt: string;
}

const categoryConfig: Record<string, { label: string; color: string }> = {
  CONTRACT: { label: "Vertrag", color: "bg-blue-100 text-blue-800" },
  PROTOCOL: { label: "Protokoll", color: "bg-purple-100 text-purple-800" },
  REPORT: { label: "Bericht", color: "bg-green-100 text-green-800" },
  INVOICE: { label: "Rechnung", color: "bg-orange-100 text-orange-800" },
  PERMIT: { label: "Genehmigung", color: "bg-red-100 text-red-800" },
  CORRESPONDENCE: { label: "Korrespondenz", color: "bg-yellow-100 text-yellow-800" },
  OTHER: { label: "Sonstiges", color: "bg-gray-100 text-gray-800" },
};

const approvalStatusConfig: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Entwurf", color: "bg-gray-100 text-gray-800" },
  PENDING_REVIEW: { label: "In Prüfung", color: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "Genehmigt", color: "bg-blue-100 text-blue-800" },
  PUBLISHED: { label: "Veroeffentlicht", color: "bg-green-100 text-green-800" },
  REJECTED: { label: "Abgelehnt", color: "bg-red-100 text-red-800" },
};

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return File;
  if (mimeType.includes("pdf")) return FileText;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
    return FileSpreadsheet;
  if (mimeType.includes("image")) return FileImage;
  return File;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "-";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);

  // Approval workflow state
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");

  useEffect(() => {
    fetchDocument();
  }, [params.id]);

  async function fetchDocument() {
    try {
      const response = await fetch(`/api/documents/${params.id}`);
      if (!response.ok) throw new Error("Fehler beim Laden");
      const data = await response.json();
      setDocument(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmArchive() {
    try {
      const response = await fetch(`/api/documents/${params.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        router.push("/documents");
      }
    } catch {
    } finally {
      setArchiveDialogOpen(false);
    }
  }

  // Approval workflow actions
  async function handleApprovalAction(
    action: "submit" | "approve" | "reject" | "publish" | "revise",
    notes?: string
  ) {
    if (!document) return;
    setApprovalLoading(true);

    try {
      const body: Record<string, unknown> = { [action]: true };
      if (notes) body.notes = notes;

      const response = await fetch(`/api/documents/${document.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "Fehler bei der Statusänderung");
        return;
      }

      toast.success(data.message || "Status erfolgreich geändert");

      // Refresh document data
      await fetchDocument();
    } catch {
      toast.error("Fehler bei der Statusänderung");
    } finally {
      setApprovalLoading(false);
      setRejectDialogOpen(false);
      setRejectNotes("");
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2">
            <Skeleton className="h-64" />
          </div>
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/documents">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück
          </Link>
        </Button>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Dokument nicht gefunden.
          </CardContent>
        </Card>
      </div>
    );
  }

  const FileIcon = getFileIcon(document.mimeType);
  const catConfig = categoryConfig[document.category];
  const statusConfig = approvalStatusConfig[document.approvalStatus];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/documents">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-muted rounded-lg">
              <FileIcon className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight">{document.title}</h1>
                <Badge variant="secondary" className={catConfig?.color}>
                  {catConfig?.label || document.category}
                </Badge>
                {statusConfig && (
                  <Badge variant="secondary" className={statusConfig.color}>
                    {statusConfig.label}
                  </Badge>
                )}
                {document.isArchived && (
                  <Badge variant="destructive">Archiviert</Badge>
                )}
              </div>
              <p className="text-muted-foreground">{document.fileName}</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {/* Approval workflow buttons */}
          {document.approvalStatus === "DRAFT" && (
            <Button
              variant="default"
              onClick={() => handleApprovalAction("submit")}
              disabled={approvalLoading}
            >
              {approvalLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <SendHorizontal className="mr-2 h-4 w-4" />
              )}
              Zur Prüfung einreichen
            </Button>
          )}
          {document.approvalStatus === "PENDING_REVIEW" && (
            <>
              <Button
                variant="default"
                onClick={() => handleApprovalAction("approve")}
                disabled={approvalLoading}
              >
                {approvalLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Genehmigen
              </Button>
              <Button
                variant="destructive"
                onClick={() => setRejectDialogOpen(true)}
                disabled={approvalLoading}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Ablehnen
              </Button>
            </>
          )}
          {document.approvalStatus === "APPROVED" && (
            <Button
              variant="default"
              onClick={() => handleApprovalAction("publish")}
              disabled={approvalLoading}
            >
              {approvalLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Globe className="mr-2 h-4 w-4" />
              )}
              Veroeffentlichen
            </Button>
          )}
          {document.approvalStatus === "REJECTED" && (
            <Button
              variant="outline"
              onClick={() => handleApprovalAction("revise")}
              disabled={approvalLoading}
            >
              {approvalLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              Überarbeiten
            </Button>
          )}

          <Button variant="outline" onClick={() => setPreviewOpen(true)}>
            <Eye className="mr-2 h-4 w-4" />
            Vorschau
          </Button>
          <Button variant="outline" asChild>
            <a href={document.fileUrl} target="_blank" rel="noopener noreferrer">
              <Download className="mr-2 h-4 w-4" />
              Herunterladen
            </a>
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/documents/${document.id}/upload`}>
              <Upload className="mr-2 h-4 w-4" />
              Neue Version
            </Link>
          </Button>
          {!document.isArchived && (
            <Button variant="outline" onClick={() => setArchiveDialogOpen(true)}>
              <Archive className="mr-2 h-4 w-4" />
              Archivieren
            </Button>
          )}
        </div>
      </div>

      {/* Rejection notice */}
      {document.approvalStatus === "REJECTED" && document.reviewNotes && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-red-800">Dokument abgelehnt</p>
                <p className="text-sm text-red-700 mt-1">{document.reviewNotes}</p>
                {document.reviewedBy && (
                  <p className="text-xs text-red-600 mt-2">
                    Abgelehnt von {document.reviewedBy.name}
                    {document.reviewedAt && (
                      <> am {format(new Date(document.reviewedAt), "dd.MM.yyyy HH:mm", { locale: de })}</>
                    )}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Content */}
        <div className="md:col-span-2 space-y-6">
          {/* Description */}
          {document.description && (
            <Card>
              <CardHeader>
                <CardTitle>Beschreibung</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap">{document.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Version History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Versionshistorie
              </CardTitle>
              <CardDescription>
                {document.versions.length} Version(en) verfügbar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>Dateiname</TableHead>
                    <TableHead>Größe</TableHead>
                    <TableHead>Hochgeladen</TableHead>
                    <TableHead>Von</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {document.versions.map((version) => (
                    <TableRow key={version.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono">v{version.version}</span>
                          {version.isCurrent && (
                            <Badge variant="secondary">Aktuell</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{version.fileName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatFileSize(version.fileSizeBytes)}
                      </TableCell>
                      <TableCell>
                        {format(new Date(version.createdAt), "dd.MM.yyyy HH:mm", {
                          locale: de,
                        })}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {version.uploadedBy || "-"}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <a
                            href={version.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Freigabestatus (Approval Status) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Freigabestatus
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                {statusConfig ? (
                  <Badge variant="secondary" className={`mt-1 ${statusConfig.color}`}>
                    {statusConfig.label}
                  </Badge>
                ) : (
                  <p className="font-medium">{document.approvalStatus}</p>
                )}
              </div>
              {document.reviewedBy && (
                <div>
                  <p className="text-sm text-muted-foreground">Geprüft von</p>
                  <p className="font-medium">{document.reviewedBy.name}</p>
                </div>
              )}
              {document.reviewedAt && (
                <div>
                  <p className="text-sm text-muted-foreground">Geprüft am</p>
                  <p className="font-medium">
                    {format(new Date(document.reviewedAt), "dd.MM.yyyy HH:mm", {
                      locale: de,
                    })}
                  </p>
                </div>
              )}
              {document.reviewNotes && document.approvalStatus !== "REJECTED" && (
                <div>
                  <p className="text-sm text-muted-foreground">Anmerkungen</p>
                  <p className="text-sm mt-1">{document.reviewNotes}</p>
                </div>
              )}
              {document.publishedAt && (
                <div>
                  <p className="text-sm text-muted-foreground">Veroeffentlicht am</p>
                  <p className="font-medium">
                    {format(new Date(document.publishedAt), "dd.MM.yyyy HH:mm", {
                      locale: de,
                    })}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Dateityp</p>
                <p className="font-medium">{document.mimeType || "Unbekannt"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Dateigröße</p>
                <p className="font-medium">{formatFileSize(document.fileSizeBytes)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Aktuelle Version</p>
                <p className="font-medium">v{document.version}</p>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground">Hochgeladen von</p>
                <p className="font-medium">{document.uploadedBy?.name || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Erstellt am</p>
                <p className="font-medium">
                  {format(new Date(document.createdAt), "dd.MM.yyyy HH:mm", {
                    locale: de,
                  })}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Zuletzt geändert</p>
                <p className="font-medium">
                  {format(new Date(document.updatedAt), "dd.MM.yyyy HH:mm", {
                    locale: de,
                  })}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Zuordnungen */}
          <Card>
            <CardHeader>
              <CardTitle>Zuordnungen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {document.park && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Windpark</span>
                  <Link
                    href={`/parks/${document.park.id}`}
                    className="text-sm font-medium hover:underline flex items-center gap-1"
                  >
                    {document.park.shortName || document.park.name}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}
              {document.fund && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Gesellschaft</span>
                  <Link
                    href={`/funds/${document.fund.id}`}
                    className="text-sm font-medium hover:underline flex items-center gap-1"
                  >
                    {document.fund.name}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}
              {document.turbine && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Anlage</span>
                  <span className="text-sm font-medium">
                    {document.turbine.designation}
                  </span>
                </div>
              )}
              {document.contract && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Vertrag</span>
                  <Link
                    href={`/contracts/${document.contract.id}`}
                    className="text-sm font-medium hover:underline flex items-center gap-1"
                  >
                    {document.contract.title}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              )}
              {document.shareholder && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Gesellschafter</span>
                  <span className="text-sm font-medium">{document.shareholder.name}</span>
                </div>
              )}
              {!document.park &&
                !document.fund &&
                !document.turbine &&
                !document.contract &&
                !document.shareholder && (
                  <p className="text-sm text-muted-foreground">
                    Keine Zuordnungen vorhanden
                  </p>
                )}
            </CardContent>
          </Card>

          {/* Tags */}
          {document.tags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Tags
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {document.tags.map((tag, index) => (
                    <Badge key={index} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Document Preview Dialog */}
      <DocumentPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        document={document ? {
          id: document.id,
          title: document.title,
          fileName: document.fileName,
          fileUrl: document.fileUrl,
          mimeType: document.mimeType,
        } : null}
      />

      {/* Archive Confirmation Dialog */}
      <DeleteConfirmDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        onConfirm={handleConfirmArchive}
        title="Archivieren bestätigen"
        description="Möchten Sie dieses Dokument wirklich archivieren?"
      />

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dokument ablehnen</DialogTitle>
            <DialogDescription>
              Bitte geben Sie einen Grund für die Ablehnung an. Der Ersteller wird benachrichtigt.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="reject-notes">Ablehnungsgrund</Label>
            <Textarea
              id="reject-notes"
              placeholder="Grund für die Ablehnung..."
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              className="mt-2"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectDialogOpen(false);
                setRejectNotes("");
              }}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectNotes.trim() || approvalLoading}
              onClick={() => handleApprovalAction("reject", rejectNotes)}
            >
              {approvalLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ablehnen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
