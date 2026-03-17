"use client";

import { useEffect, useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { Building2, Check, Star, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TenantOption {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  isPrimary: boolean;
  roleHierarchy: number;
}

export function TenantSwitcher() {
  const { data: session } = useSession();
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!session?.user?.id) return;
    // Load all memberships
    fetch("/api/user/tenants")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.tenants) setTenants(data.tenants); })
      .catch(() => {});
    // Read active tenant from signed cookie (server-side) — bypasses middleware matcher issue
    fetch("/api/user/switch-tenant")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { setActiveTenantId(data?.activeTenantId ?? null); })
      .catch(() => {});
  }, [session?.user?.id]);

  // Only show switcher if user has more than one tenant
  if (tenants.length <= 1) return null;

  // Prefer cookie-backed active tenant; fall back to JWT session tenant
  const currentTenantId = activeTenantId ?? session?.user?.tenantId;
  const currentTenant = tenants.find((t) => t.id === currentTenantId) ?? tenants[0];

  const switchTenant = (tenantId: string) => {
    if (tenantId === currentTenantId) return;
    startTransition(async () => {
      await fetch("/api/user/switch-tenant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId }),
      });
      window.location.reload();
    });
  };

  const returnToPrimary = () => {
    const primary = tenants.find((t) => t.isPrimary);
    if (!primary || primary.id === currentTenantId) return;
    startTransition(async () => {
      await fetch("/api/user/switch-tenant", { method: "DELETE" });
      window.location.reload();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          className="gap-1.5 px-2 transition-all duration-200 hover:bg-accent hidden lg:flex"
          title="Mandant wechseln"
        >
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="max-w-[120px] truncate text-sm font-medium">
            {currentTenant?.name ?? session?.user?.tenantName}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          Mandant wechseln
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tenants.map((tenant) => (
          <DropdownMenuItem
            key={tenant.id}
            onClick={() => tenant.isPrimary && tenant.id !== currentTenantId
              ? returnToPrimary()
              : switchTenant(tenant.id)
            }
            className="cursor-pointer gap-2"
          >
            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="flex-1 truncate">{tenant.name}</span>
            {tenant.isPrimary && (
              <Star className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            {tenant.id === currentTenantId && (
              <Check className="h-4 w-4 shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
