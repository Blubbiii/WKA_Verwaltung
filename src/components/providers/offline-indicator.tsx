"use client";

import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

/**
 * Shows a banner when the browser loses internet connection.
 * Automatically hides when the connection is restored.
 */
export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    // Check initial state
    if (!navigator.onLine) setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-destructive text-destructive-foreground px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2 animate-in slide-in-from-top">
      <WifiOff className="h-4 w-4" />
      <span>Keine Internetverbindung — Änderungen können nicht gespeichert werden</span>
    </div>
  );
}
