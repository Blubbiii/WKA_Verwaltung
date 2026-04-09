"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Legacy route — CRM templates are now managed centrally in the
 * admin email settings page alongside system templates. Redirect to
 * /kommunikation/email which has the templates tab.
 */
export default function CrmTemplatesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/kommunikation/email");
  }, [router]);
  return (
    <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
      Weiterleitung zur E-Mail-Einstellungsseite…
    </div>
  );
}
