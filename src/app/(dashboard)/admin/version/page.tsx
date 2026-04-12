"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Tag,
  Save,
  Loader2,
  AlertTriangle,
  Server,
  Package,
  Info,
} from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface VersionInfo {
  packageVersion: string;
  displayVersion: string;
  nodeVersion: string;
  environment: string;
  buildTime: string | null;
}

export default function VersionPage() {
  const t = useTranslations("admin.version");
  const { data: session } = useSession();
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newVersion, setNewVersion] = useState("");

  const fetchVersion = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/version");
      if (!res.ok) throw new Error("load-error");
      const data = await res.json();
      setVersionInfo(data);
      setNewVersion(data.displayVersion);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchVersion();
  }, [fetchVersion]);

  if ((session?.user?.roleHierarchy ?? 0) < 100) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground gap-2">
        <AlertTriangle className="h-8 w-8" />
        <p>{t("accessDenied")}</p>
      </div>
    );
  }

  const handleSave = async () => {
    if (!newVersion.match(/^\d+\.\d+\.\d+(-[\w.]+)?$/)) {
      toast.error(t("invalidFormat"));
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/version", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayVersion: newVersion }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || t("saveError"));
      }
      toast.success(t("savedToast", { version: newVersion }));
      fetchVersion();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("saveError")
      );
    } finally {
      setSaving(false);
    }
  };

  const hasChanged =
    versionInfo && newVersion !== versionInfo.displayVersion;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
      />

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Current Version Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                {t("currentVersion")}
              </CardTitle>
              <CardDescription>
                {t("currentVersionDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("displayedVersion")}</Label>
                <div className="flex gap-2">
                  <Input
                    value={newVersion}
                    onChange={(e) => setNewVersion(e.target.value)}
                    placeholder={t("placeholder")}
                    className="font-mono"
                  />
                  <Button
                    onClick={handleSave}
                    disabled={saving || !hasChanged}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("versionFormatHint")}
                </p>
              </div>

              {versionInfo &&
                versionInfo.displayVersion !==
                  versionInfo.packageVersion && (
                  <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                    <Info className="h-4 w-4" />
                    <span>
                      {t("versionMismatch", { version: versionInfo.packageVersion })}
                    </span>
                  </div>
                )}
            </CardContent>
          </Card>

          {/* Build Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                {t("buildInfo")}
              </CardTitle>
              <CardDescription>
                {t("buildInfoDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("packageJson")}
                  </span>
                  <Badge variant="outline" className="font-mono">
                    <Package className="h-3 w-3 mr-1" />v
                    {versionInfo?.packageVersion}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("nodeJs")}
                  </span>
                  <Badge variant="outline" className="font-mono">
                    {versionInfo?.nodeVersion}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("environment")}
                  </span>
                  <Badge
                    variant={
                      versionInfo?.environment === "production"
                        ? "default"
                        : "secondary"
                    }
                  >
                    {versionInfo?.environment}
                  </Badge>
                </div>
                {versionInfo?.buildTime && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {t("buildTime")}
                    </span>
                    <Badge variant="outline" className="font-mono">
                      {versionInfo.buildTime}
                    </Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
