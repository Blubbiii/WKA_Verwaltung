"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Search, User, LogOut, Settings, Moon, Sun, Shield, X, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useSession, signOut } from "next-auth/react";
import { useKeyboardContext } from "@/components/providers/keyboard-provider";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { NotificationBell } from "@/components/layout/notification-bell";

interface ImpersonationData {
  originalUserId: string;
  originalEmail: string;
  targetUserId: string;
  targetEmail: string;
  targetName: string;
  targetRole: string;
  targetTenantId: string;
  targetTenantName: string;
  startedAt: string;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.split(" ");
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function Header() {
  const { data: session } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [impersonation, setImpersonation] = useState<ImpersonationData | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const t = useTranslations();

  // Keyboard shortcuts context - safe to call here since Header is always
  // rendered inside the dashboard layout which wraps with KeyboardProvider
  const { openShortcutsDialog } = useKeyboardContext();

  // Mark as mounted after first render to avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Check for impersonation status on mount
  useEffect(() => {
    async function checkImpersonation() {
      try {
        const response = await fetch("/api/admin/impersonate");
        if (response.ok) {
          const data = await response.json();
          setImpersonation(data.impersonating);
        }
      } catch {
        // Impersonation check failed silently
      }
    }
    checkImpersonation();
  }, []);

  // Fetch user avatar on mount
  useEffect(() => {
    async function fetchAvatar() {
      try {
        const response = await fetch("/api/user/avatar");
        if (response.ok) {
          const data = await response.json();
          if (data.signedUrl) {
            setAvatarUrl(data.signedUrl);
          }
        }
      } catch {
        // Silently fail - avatar is not critical
      }
    }
    if (session?.user?.id) {
      fetchAvatar();
    }
  }, [session?.user?.id]);

  const toggleTheme = () => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  const stopImpersonation = async () => {
    try {
      const response = await fetch("/api/admin/impersonate", {
        method: "DELETE",
      });
      if (response.ok) {
        setImpersonation(null);
        window.location.reload();
      }
    } catch {
      // Stop impersonation failed silently
    }
  };

  const handleLogout = async () => {
    await signOut({ callbackUrl: "/login" });
  };

  return (
    <>
      {/* Impersonation Banner */}
      {impersonation && (
        <div className="flex items-center justify-between px-4 py-2 bg-orange-500 text-white">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span className="text-sm font-medium">
              {t("header.impersonationActive")}{" "}
              <strong>{impersonation.targetName || impersonation.targetEmail}</strong>
              {" "}({impersonation.targetRole}) {t("header.impersonationAt")} <strong>{impersonation.targetTenantName}</strong>
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-orange-600"
            onClick={stopImpersonation}
          >
            <X className="h-4 w-4 mr-1" />
            {t("common.end")}
          </Button>
        </div>
      )}

      <header className="flex items-center justify-between h-16 px-6 border-b border-border/50 bg-background/95 backdrop-blur-sm shadow-sm sticky top-0 z-30">
        {/* Search */}
        <div className="flex items-center gap-4 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t("header.search")}
              className="pl-10 pr-16 w-full"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
              Ctrl+K
            </kbd>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Tenant Badge */}
          {session?.user?.tenantName && (
            <div className="hidden lg:flex items-center px-3 py-1 bg-primary/10 text-primary text-sm font-medium rounded-full">
              {impersonation ? impersonation.targetTenantName : session.user.tenantName}
            </div>
          )}

          {/* Theme Toggle - only render icon after mount to prevent hydration mismatch */}
          <Button variant="ghost" size="icon" onClick={toggleTheme} className="transition-all duration-200 hover:bg-accent" title={resolvedTheme === "dark" ? t("common.lightMode") : t("common.darkMode")} aria-label={resolvedTheme === "dark" ? t("common.lightMode") : t("common.darkMode")}>
            {mounted ? (resolvedTheme === "dark" ? <Sun className="h-5 w-5 transition-transform duration-200 hover:rotate-12" /> : <Moon className="h-5 w-5 transition-transform duration-200 hover:-rotate-12" />) : <div className="h-5 w-5" />}
          </Button>

          {/* Language Switcher */}
          <LanguageSwitcher />

          {/* Keyboard Shortcuts */}
          <Button
            variant="ghost"
            size="icon"
            onClick={openShortcutsDialog}
            className="transition-all duration-200 hover:bg-accent"
            title={t("header.keyboardShortcuts") + " (?)"}
            aria-label={t("header.keyboardShortcuts")}
          >
            <Keyboard className="h-5 w-5" />
          </Button>

          {/* Notifications */}
          <NotificationBell />

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2 transition-all duration-200 hover:bg-accent">
                <Avatar className="h-8 w-8">
                  {avatarUrl && (
                    <AvatarImage src={avatarUrl} alt={session?.user?.name || "User"} />
                  )}
                  <AvatarFallback>{getInitials(session?.user?.name)}</AvatarFallback>
                </Avatar>
                <span className="hidden md:inline-block font-medium">
                  {impersonation ? impersonation.targetName : (session?.user?.name || t("common.user"))}
                </span>
                {impersonation && (
                  <Badge variant="outline" className="ml-1 text-orange-600 border-orange-600">
                    Impersonation
                  </Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span>{impersonation ? impersonation.targetName : (session?.user?.name || t("common.user"))}</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {impersonation ? impersonation.targetEmail : session?.user?.email}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground mt-1">
                    {t("common.role")}: {impersonation ? impersonation.targetRole : (session?.user?.role || t("common.unknown"))}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <User className="mr-2 h-4 w-4" />
                  {t("common.profile")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  {t("common.settings")}
                </Link>
              </DropdownMenuItem>
              {impersonation && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-orange-600 cursor-pointer"
                    onClick={stopImpersonation}
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    Impersonation beenden
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive cursor-pointer"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {t("common.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </>
  );
}
