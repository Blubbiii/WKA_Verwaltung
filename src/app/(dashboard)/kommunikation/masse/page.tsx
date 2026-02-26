"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * Redirect: /kommunikation/masse → /kommunikation/erstellen?mode=freeform
 *
 * Mass communication has been unified into the main mailing wizard.
 */
export default function MasseCommunicationRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/kommunikation/erstellen?mode=freeform");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
