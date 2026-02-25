"use client";

import { useState, useEffect, useCallback } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
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
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, FileText } from "lucide-react";
import { TemplateEditor } from "@/components/mailings/template-editor";

// =============================================================================
// Types
// =============================================================================

interface MailingTemplate {
  id: string;
  name: string;
  category: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  variables: Array<{ key: string; label: string; example: string }>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  GV_EINLADUNG: "GV-Einladung",
  QUARTALSBERICHT: "Quartalsbericht",
  JAHRESABSCHLUSS: "Jahresabschluss",
  MAHNUNG: "Mahnung",
  INFORMATION: "Information",
  CUSTOM: "Benutzerdefiniert",
};

const CATEGORY_COLORS: Record<string, string> = {
  GV_EINLADUNG: "bg-purple-100 text-purple-800 border-purple-200",
  QUARTALSBERICHT: "bg-blue-100 text-blue-800 border-blue-200",
  JAHRESABSCHLUSS: "bg-green-100 text-green-800 border-green-200",
  MAHNUNG: "bg-red-100 text-red-800 border-red-200",
  INFORMATION: "bg-yellow-100 text-yellow-800 border-yellow-200",
  CUSTOM: "bg-gray-100 text-gray-800 border-gray-200",
};

// =============================================================================
// Component
// =============================================================================

export default function MailingTemplatesPage() {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<MailingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MailingTemplate | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/mailings/templates");
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates ?? []);
      }
    } catch {
      toast({ title: "Fehler", description: "Vorlagen konnten nicht geladen werden", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/mailings/templates/${deleteId}`, { method: "DELETE" });
      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== deleteId));
        toast({ title: "Vorlage gelöscht" });
      } else {
        const data = await res.json();
        toast({ title: "Fehler", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Fehler", description: "Löschen fehlgeschlagen", variant: "destructive" });
    } finally {
      setDeleteId(null);
    }
  };

  const handleSaved = () => {
    setEditorOpen(false);
    setEditingTemplate(null);
    fetchTemplates();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mailing-Vorlagen"
        description="Vorlagen für Serienbriefe an Gesellschafter"
        actions={
          <Button onClick={() => { setEditingTemplate(null); setEditorOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Neue Vorlage
          </Button>
        }
      />

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
              <CardContent><Skeleton className="h-4 w-full" /><Skeleton className="mt-2 h-4 w-3/4" /></CardContent>
            </Card>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Keine Vorlagen"
          description="Erstellen Sie Ihre erste Mailing-Vorlage mit Platzhaltern für Gesellschafterdaten."
          action={
            <Button onClick={() => { setEditingTemplate(null); setEditorOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" />
              Vorlage erstellen
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id} className="group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <Badge className={CATEGORY_COLORS[t.category] ?? CATEGORY_COLORS.CUSTOM}>
                      {CATEGORY_LABELS[t.category] ?? t.category}
                    </Badge>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => { setEditingTemplate(t); setEditorOpen(true); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteId(t.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-1">
                  Betreff: {t.subject}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Aktualisiert: {new Date(t.updatedAt).toLocaleDateString("de-DE")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Template Editor Dialog */}
      {editorOpen && (
        <TemplateEditor
          open={editorOpen}
          onClose={() => { setEditorOpen(false); setEditingTemplate(null); }}
          onSaved={handleSaved}
          template={editingTemplate}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vorlage löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
