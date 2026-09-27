"use client";

/**
 * External access to the tenant's parks (2026-09): which service providers
 * reach them through a management contract (ParkStakeholder), and ending
 * such an access. Reads GET /api/zugriffe (settings:read); ending needs
 * settings:update.
 */

import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Handshake } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { useConfirm } from "@/components/ui/use-confirm";
import { formatDate } from "@/lib/format";

interface Zugriff {
  id: string;
  dienstleister: string;
  park: string | null;
  rolle: "DEVELOPER" | "GRID_OPERATOR" | "TECHNICAL_BF" | "COMMERCIAL_BF" | "OPERATOR";
  seit: string;
  abrechnung: boolean;
}

const SCHLUESSEL = ["zugriffe"];

export function ExterneZugriffe({ darfBeenden }: { darfBeenden: boolean }) {
  const t = useTranslations("zugriffe");
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();

  const { data, isLoading, error } = useQuery({
    queryKey: SCHLUESSEL,
    queryFn: async (): Promise<Zugriff[]> => {
      const res = await fetch("/api/zugriffe");
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()).zugriffe;
    },
    staleTime: 60_000,
  });

  const beenden = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/zugriffe/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? t("endFailed"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SCHLUESSEL });
      toast.success(t("ended"));
    },
    onError: (e) => toast.error(e.message),
  });

  const fragen = async (z: Zugriff) => {
    const ok = await confirm({
      title: t("confirmTitle", { dienstleister: z.dienstleister }),
      description: t("confirmDescription", { park: z.park ?? t("unknownPark") }),
      confirmLabel: t("end"),
      variant: "destructive",
    });
    if (ok) beenden.mutate(z.id);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">{t("loadFailed")}</p>
        ) : (
          <DataTable
            rows={data ?? []}
            getRowId={(z) => z.id}
            isLoading={isLoading}
            empty={{ icon: Handshake, title: t("emptyTitle"), description: t("emptyDescription") }}
            columns={[
              {
                id: "dienstleister",
                header: t("provider"),
                cell: (z) => z.dienstleister,
                sortValue: (z) => z.dienstleister,
                searchValue: (z) => z.dienstleister,
              },
              {
                id: "park",
                header: t("park"),
                cell: (z) => z.park ?? t("unknownPark"),
                sortValue: (z) => z.park,
                searchValue: (z) => z.park,
              },
              { id: "rolle", header: t("role"), cell: (z) => t(`roles.${z.rolle}`), sortValue: (z) => z.rolle },
              {
                id: "abrechnung",
                header: t("billing"),
                cell: (z) => (z.abrechnung ? t("yes") : t("no")),
              },
              {
                id: "seit",
                header: t("since"),
                align: "right",
                cell: (z) => formatDate(z.seit),
                sortValue: (z) => new Date(z.seit),
              },
              ...(darfBeenden
                ? [
                    {
                      id: "aktion",
                      header: "",
                      align: "right" as const,
                      cell: (z: Zugriff) => (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={beenden.isPending}
                          onClick={() => fragen(z)}
                        >
                          {t("end")}
                        </Button>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        )}
      </CardContent>
      {confirmDialog}
    </Card>
  );
}
