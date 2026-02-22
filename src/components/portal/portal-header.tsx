"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { LogOut, User, Settings, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function PortalHeader() {
  const { data: session } = useSession();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const userInitials = session?.user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "??";

  // Use hierarchy-based check (>= 60 = Manager), with legacy enum as fallback
  const canAccessAdmin =
    (session?.user?.roleHierarchy ?? 0) >= 60 ||
    (session?.user?.role && ["SUPERADMIN", "ADMIN", "MANAGER"].includes(session.user.role));

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

  return (
    <header className="h-16 border-b border-border bg-background px-6">
      <div className="flex h-full items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Willkommen im Anleger-Portal</h2>
        </div>

        <div className="flex items-center gap-4">
          {canAccessAdmin && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Zur Verwaltung
              </Link>
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                <Avatar className="h-10 w-10">
                  {avatarUrl && (
                    <AvatarImage src={avatarUrl} alt={session?.user?.name || "User"} />
                  )}
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{session?.user?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {session?.user?.email}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/portal/profile">
                  <User className="mr-2 h-4 w-4" />
                  Mein Profil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/portal/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Einstellungen
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="text-red-600"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Abmelden
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
