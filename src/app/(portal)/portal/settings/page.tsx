"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatDateTime } from "@/lib/format";
import {
  Bell,
  Globe,
  Shield,
  Lock,
  Mail,
  FileText,
  Wallet,
  Vote,
  Info,
  Download,
  Trash2,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export default function SettingsPage() {
  const t = useTranslations("portal.settings");
  // Notification settings (placeholder state - not persisted)
  const [notifications, setNotifications] = useState({
    newVote: true,
    newDistribution: true,
    newDocument: false,
  });
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDataExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/portal/my-data/export");
      if (!res.ok) throw new Error(t("privacy.exportFailed"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `datenauskunft-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("privacy.exportSuccess"));
    } catch {
      toast.error(t("privacy.exportFailed"));
    } finally {
      setExporting(false);
    }
  }

  async function handleAccountDelete() {
    setDeleting(true);
    try {
      const res = await fetch("/api/portal/my-account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE_MY_ACCOUNT" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t("privacy.deleteFailed"));
      }
      toast.success(t("privacy.deleteSuccess"));
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("privacy.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  }

  // Mock last login date
  const lastLogin = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

  // formatDate with datetime → use central formatDateTime from @/lib/format
  const formatDate = formatDateTime;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t("description")}
        </p>
      </div>

      {/* Notifications Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {t("notifications.title")}
          </CardTitle>
          <CardDescription>
            {t("notifications.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Info Alert */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {t("notifications.info")}
            </AlertDescription>
          </Alert>

          {/* Notification Options */}
          <div className="space-y-4">
            {/* New Vote Notification */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100">
                  <Vote className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <Label htmlFor="notify-vote" className="text-base font-medium">
                    {t("notifications.newVote")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("notifications.newVoteDesc")}
                  </p>
                </div>
              </div>
              <Switch
                id="notify-vote"
                checked={notifications.newVote}
                onCheckedChange={(checked) =>
                  setNotifications((prev) => ({ ...prev, newVote: checked }))
                }
                disabled
              />
            </div>

            {/* New Distribution Notification */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                  <Wallet className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <Label htmlFor="notify-distribution" className="text-base font-medium">
                    {t("notifications.newDistribution")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("notifications.newDistributionDesc")}
                  </p>
                </div>
              </div>
              <Switch
                id="notify-distribution"
                checked={notifications.newDistribution}
                onCheckedChange={(checked) =>
                  setNotifications((prev) => ({ ...prev, newDistribution: checked }))
                }
                disabled
              />
            </div>

            {/* New Document Notification */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                  <FileText className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <Label htmlFor="notify-document" className="text-base font-medium">
                    {t("notifications.newDocument")}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t("notifications.newDocumentDesc")}
                  </p>
                </div>
              </div>
              <Switch
                id="notify-document"
                checked={notifications.newDocument}
                onCheckedChange={(checked) =>
                  setNotifications((prev) => ({ ...prev, newDocument: checked }))
                }
                disabled
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Display Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {t("display.title")}
          </CardTitle>
          <CardDescription>
            {t("display.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Language */}
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t("display.language")}</Label>
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span>{t("display.german")}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("display.languageInfo")}
              </p>
            </div>

            {/* Currency */}
            <div className="space-y-2">
              <Label className="text-muted-foreground">{t("display.currency")}</Label>
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                <span className="text-muted-foreground">EUR</span>
                <span>{t("display.euro")}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("display.currencyInfo")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("security.title")}
          </CardTitle>
          <CardDescription>
            {t("security.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Password Change */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
                <Lock className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-base font-medium">{t("security.changePassword")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("security.changePasswordDesc")}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Button variant="outline" disabled>
                {t("security.changePassword")}
              </Button>
              <span className="text-xs text-muted-foreground">{t("security.comingSoon")}</span>
            </div>
          </div>

          {/* Last Login */}
          <div className="border-t pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <Mail className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-base font-medium">{t("security.lastLogin")}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDate(lastLogin)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DSGVO / Data Privacy Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("privacy.title")}
          </CardTitle>
          <CardDescription>
            {t("privacy.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Data Export (Art. 15) */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <Download className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-base font-medium">{t("privacy.dataExport")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("privacy.dataExportDesc")}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={handleDataExport}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {t("privacy.exportButton")}
            </Button>
          </div>

          {/* Account Deletion (Art. 17) */}
          <div className="border-t pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                  <Trash2 className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-base font-medium">{t("privacy.deleteAccount")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("privacy.deleteAccountDesc")}
                  </p>
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={deleting}>
                    {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {t("privacy.deleteButton")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("privacy.deleteDialog.title")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("privacy.deleteDialog.description")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("privacy.deleteDialog.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleAccountDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {t("privacy.deleteDialog.confirm")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
