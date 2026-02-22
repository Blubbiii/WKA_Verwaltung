"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Edit,
  Trash2,
  Calendar,
  Building2,
  User,
  Send,
  Clock,
  CheckCircle,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { SafeHtml } from "@/components/ui/safe-html";

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  GENERAL: { label: "Allgemein", color: "bg-gray-100 text-gray-800" },
  FINANCIAL: { label: "Finanziell", color: "bg-blue-100 text-blue-800" },
  TECHNICAL: { label: "Technisch", color: "bg-purple-100 text-purple-800" },
  LEGAL: { label: "Rechtlich", color: "bg-orange-100 text-orange-800" },
};

interface NewsDetail {
  id: string;
  title: string;
  content: string;
  category: string;
  isPublished: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  fund: {
    id: string;
    name: string;
    legalForm: string | null;
  } | null;
  createdBy: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
}

export default function NewsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [news, setNews] = useState<NewsDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    async function loadNews() {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/news/${id}`);
        if (response.ok) {
          const data = await response.json();
          setNews(data);
        } else if (response.status === 404) {
          router.push("/news");
        }
      } catch {
      } finally {
        setIsLoading(false);
      }
    }
    loadNews();
  }, [id, router]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getAuthorName = (author: NewsDetail["createdBy"]) => {
    if (!author) return "System";
    return `${author.firstName || ""} ${author.lastName || ""}`.trim() || "Unbekannt";
  };

  const handleDelete = async () => {
    try {
      const response = await fetch(`/api/news/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        router.push("/news");
      }
    } catch {
    }
  };

  const handlePublish = async (isPublished: boolean) => {
    try {
      const response = await fetch(`/api/news/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished }),
      });

      if (response.ok) {
        const updated = await response.json();
        setNews((prev) =>
          prev
            ? { ...prev, isPublished: updated.isPublished, publishedAt: updated.publishedAt }
            : null
        );
      }
    } catch {
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/3" />
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-4 w-1/4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!news) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/news">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-3xl font-bold tracking-tight">{news.title}</h1>
              <Badge
                variant={news.isPublished ? "default" : "secondary"}
                className={
                  news.isPublished
                    ? "bg-green-100 text-green-800"
                    : "bg-yellow-100 text-yellow-800"
                }
              >
                {news.isPublished ? "Veröffentlicht" : "Entwurf"}
              </Badge>
              {news.category && CATEGORY_LABELS[news.category] && (
                <Badge
                  variant="outline"
                  className={CATEGORY_LABELS[news.category].color}
                >
                  {CATEGORY_LABELS[news.category].label}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">Meldungsdetails</p>
          </div>
        </div>
        <div className="flex gap-2">
          {news.isPublished ? (
            <Button variant="outline" onClick={() => handlePublish(false)}>
              <Clock className="mr-2 h-4 w-4" />
              Zurück zu Entwurf
            </Button>
          ) : (
            <Button onClick={() => handlePublish(true)}>
              <Send className="mr-2 h-4 w-4" />
              Veröffentlichen
            </Button>
          )}
          <Link href={`/news/${id}/edit`}>
            <Button variant="outline">
              <Edit className="mr-2 h-4 w-4" />
              Bearbeiten
            </Button>
          </Link>
          <Button
            variant="outline"
            className="text-destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Löschen
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Inhalt</CardTitle>
          </CardHeader>
          <CardContent>
            <SafeHtml html={news.content} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Informationen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                {news.isPublished ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <Clock className="h-4 w-4 text-yellow-500" />
                )}
                <div>
                  <p className="font-medium">Status</p>
                  <p className="text-sm text-muted-foreground">
                    {news.isPublished ? "Veröffentlicht" : "Entwurf"}
                  </p>
                </div>
              </div>

              <Separator />

              {news.isPublished && news.publishedAt && (
                <>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Veröffentlicht am</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(news.publishedAt)}
                      </p>
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">Erstellt am</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(news.createdAt)}
                  </p>
                </div>
              </div>

              {news.expiresAt && (
                <>
                  <Separator />
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Läuft ab am</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDate(news.expiresAt)}
                      </p>
                    </div>
                  </div>
                </>
              )}

              <Separator />

              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">Erstellt von</p>
                  <p className="text-sm text-muted-foreground">
                    {getAuthorName(news.createdBy)}
                  </p>
                </div>
              </div>

              {news.fund && (
                <>
                  <Separator />
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Gesellschaft</p>
                      <Link
                        href={`/funds/${news.fund.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {news.fund.name}
                      </Link>
                    </div>
                  </div>
                </>
              )}

              {news.category && CATEGORY_LABELS[news.category] && (
                <>
                  <Separator />
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Kategorie</p>
                      <Badge
                        variant="outline"
                        className={CATEGORY_LABELS[news.category].color}
                      >
                        {CATEGORY_LABELS[news.category].label}
                      </Badge>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Meldung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion kann nicht rückgängig gemacht werden. Die Meldung wird
              dauerhaft gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
