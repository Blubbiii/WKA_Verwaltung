"use client";

/**
 * Favoriten verwalten und Bereiche ausblenden.
 *
 * ## Was hier bewusst NICHT passiert
 *
 * Man legt hier **keine** Favoriten an. Der Stern dafür steht neben der
 * Seitenüberschrift und am Navigationseintrag — dort, wo man denkt „das
 * brauche ich oft". Eine Maske, in der man aus einer Liste aller Bildschirme
 * auswählen müsste, füllt fast niemand: man müsste sich die Namen aus dem
 * Kopf abrufen, statt sie vor sich zu haben.
 *
 * Hier wird **geordnet**: gruppieren, benennen, aufräumen. Das ist etwas
 * anderes und passiert seltener.
 *
 * ## Warum Gruppen erst ab einer gewissen Menge auftauchen
 *
 * Wer drei Favoriten hat, will keinen Ordner dafür anlegen. Die
 * Gruppenverwaltung steht deshalb hier und nicht im Weg — sichtbar, aber
 * nicht aufdringlich.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, FolderPlus, Star, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSidebarPrefsContext } from "@/components/layout/sidebar-prefs-provider";
import {
  MAX_GRUPPEN,
  MAX_NAME_LAENGE,
  gruppeAnlegen,
  gruppeLoeschen,
  gruppeSichtbarkeit,
  gruppeUmbenennen,
  umschalten,
  zuordnen,
} from "@/lib/sidebar/prefs";
import { navGroups } from "@/config/nav-config";
import { zielBeschriftungen } from "@/lib/sidebar/labels";

export default function SidebarSettingsPage() {
  const t = useTranslations();
  const { prefs, isLoading, speichern } = useSidebarPrefsContext();
  const [neuerName, setNeuerName] = useState("");

  // Dieselbe Auflösung wie in der Seitenleiste — siehe lib/sidebar/labels.ts.
  const beschriftungen = useMemo(() => zielBeschriftungen(t), [t]);

  const gruppenAuswahl = [
    { value: "__lose", label: t("sidebar.favorites.ungrouped") },
    ...prefs.gruppen.map((g) => ({ value: g.id, label: g.name })),
  ];

  function eintrag(href: string, gruppeId: string | null) {
    const label = beschriftungen.get(href);
    return (
      <li key={href} className="flex items-center gap-2 py-1.5">
        <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
        <span className="flex-1 truncate text-sm">
          {label ?? (
            // Ein Favorit, dessen Ziel es nicht mehr gibt — etwa nach einem
            // Umbau der Navigation. Er wird nicht stillschweigend geloescht:
            // der Nutzer soll sehen, dass da etwas war, und selbst entscheiden.
            <span className="text-muted-foreground italic">{href}</span>
          )}
        </span>

        {prefs.gruppen.length > 0 && (
          <Select
            value={gruppeId ?? "__lose"}
            onValueChange={(v) =>
              void speichern(zuordnen(prefs, href, v === "__lose" ? null : v))
            }
          >
            <SelectTrigger className="h-8 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {gruppenAuswahl.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={t("sidebar.favorites.remove")}
          aria-label={t("sidebar.favorites.remove")}
          onClick={() => void speichern(umschalten(prefs, href))}
        >
          <X className="h-4 w-4" />
        </Button>
      </li>
    );
  }

  const hatFavoriten =
    prefs.lose.length > 0 || prefs.gruppen.some((g) => g.hrefs.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("sidebar.favorites.manage")}
        description={t("sidebar.favorites.hiddenGroupsHint")}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-4 w-4" />
            {t("sidebar.favorites.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !hatFavoriten ? (
            <EmptyState
              icon={Star}
              title={t("sidebar.favorites.empty")}
              description={t("sidebar.favorites.add")}
            />
          ) : (
            <>
              {prefs.gruppen.map((gruppe) => (
                <div key={gruppe.id} className="rounded-md border p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Input
                      value={gruppe.name}
                      maxLength={MAX_NAME_LAENGE}
                      onChange={(e) =>
                        void speichern(gruppeUmbenennen(prefs, gruppe.id, e.target.value))
                      }
                      className="h-8 max-w-xs font-medium"
                      aria-label={t("sidebar.favorites.groupName")}
                    />
                    <Badge variant="secondary">{gruppe.hrefs.length}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto h-8 w-8 text-muted-foreground"
                      // Die Eintraege bleiben Favoriten und werden lose — der
                      // Nutzer wollte die Ordnung aufloesen, nicht die Auswahl.
                      title={t("common.delete")}
                      aria-label={t("common.delete")}
                      onClick={() => void speichern(gruppeLoeschen(prefs, gruppe.id))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <ul className="divide-y divide-border/60">
                    {gruppe.hrefs.map((href) => eintrag(href, gruppe.id))}
                  </ul>
                </div>
              ))}

              {prefs.lose.length > 0 && (
                <div>
                  <div className="mb-1 text-sm font-medium text-muted-foreground">
                    {t("sidebar.favorites.ungrouped")}
                  </div>
                  <ul className="divide-y divide-border/60">
                    {prefs.lose.map((href) => eintrag(href, null))}
                  </ul>
                </div>
              )}
            </>
          )}

          {prefs.gruppen.length < MAX_GRUPPEN && (
            <div className="flex items-end gap-2 border-t pt-4">
              <div className="flex-1 max-w-xs">
                <label className="text-xs text-muted-foreground">
                  {t("sidebar.favorites.groupName")}
                </label>
                <Input
                  value={neuerName}
                  maxLength={MAX_NAME_LAENGE}
                  placeholder={t("sidebar.favorites.newGroup")}
                  onChange={(e) => setNeuerName(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                disabled={!neuerName.trim()}
                onClick={() => {
                  // Kennung aus der Zeit: der Name darf sich aendern, die
                  // Zuordnung nicht.
                  void speichern(
                    gruppeAnlegen(prefs, neuerName, `g${Date.now().toString(36)}`),
                  );
                  setNeuerName("");
                }}
              >
                <FolderPlus className="mr-2 h-4 w-4" />
                {t("sidebar.favorites.newGroup")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <EyeOff className="h-4 w-4" />
            {t("sidebar.favorites.hiddenGroups")}
          </CardTitle>
          <CardDescription>{t("sidebar.favorites.hiddenGroupsHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border/60">
            {navGroups
              .filter((g) => g.labelKey)
              .map((gruppe) => {
                const versteckt = prefs.versteckteGruppen.includes(gruppe.labelKey!);
                return (
                  <li key={gruppe.labelKey} className="flex items-center gap-3 py-2">
                    <span className="flex-1 text-sm">{t(`nav.${gruppe.labelKey}`)}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void speichern(gruppeSichtbarkeit(prefs, gruppe.labelKey!))
                      }
                    >
                      {versteckt ? (
                        <>
                          <EyeOff className="mr-2 h-4 w-4" />
                          {t("common.hidden")}
                        </>
                      ) : (
                        <>
                          <Eye className="mr-2 h-4 w-4" />
                          {t("common.visible")}
                        </>
                      )}
                    </Button>
                  </li>
                );
              })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
