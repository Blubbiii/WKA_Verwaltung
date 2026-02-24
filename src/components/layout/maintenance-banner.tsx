"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MaintenanceStatus {
  active: boolean;
  message: string;
}

export function MaintenanceBanner() {
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const response = await fetch("/api/admin/maintenance");
        if (response.ok) {
          const data: MaintenanceStatus = await response.json();
          setStatus(data);
        }
      } catch {
        // Silently fail - banner is non-critical
      }
    }

    fetchStatus();

    // Poll every 5 minutes to detect changes
    const interval = setInterval(fetchStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!status?.active || dismissed) {
    return null;
  }

  return (
    <div className="bg-yellow-500 text-yellow-900 px-4 py-2 text-center text-sm font-medium relative flex items-center justify-center">
      <span>
        {status.message ||
          "Das System befindet sich im Wartungsmodus. Bitte versuchen Sie es später erneut."}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 text-yellow-900 hover:bg-yellow-600/20"
        onClick={() => setDismissed(true)}
        aria-label="Banner schliessen"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
