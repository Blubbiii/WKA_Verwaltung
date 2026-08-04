"use client";

import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

/**
 * Shows a banner when the browser loses internet connection.
 * Automatically hides when the connection is restored.
 */
export function OfflineIndicator() {
  /*
    IMMER `false` als Startwert — der Verbindungszustand wird erst nach dem
    Einhängen ermittelt.

    Hier stand:

        typeof navigator !== "undefined" ? !navigator.onLine : false
        // "safe because this is 'use client'"

    Der Kommentar war der Fehler. Eine `"use client"`-Komponente wird trotzdem
    auf dem SERVER gerendert — „use client" heisst „auch im Browser", nicht
    „nur im Browser".

    Die Abfrage war richtig, als sie geschrieben wurde: früher gab es in Node
    kein globales `navigator`, also griff der `false`-Zweig. Seit Node 21 GIBT
    es eines — aber ohne `onLine`. Damit ist `navigator.onLine` `undefined`,
    `!undefined` ist `true`, und der Server hielt sich für offline.

    Wirkung: auf JEDER Seite schickte der Server das rote Offline-Banner mit,
    während der Browser an derselben Stelle die Seitenleiste rendert — ein
    Hydrierungsfehler bei jedem einzelnen Seitenaufruf. React verwirft
    daraufhin den Baum und baut ihn neu auf; auf manchen Seiten landet das im
    Fehler-Auffangnetz, und der Nutzer sieht „Ein Fehler ist aufgetreten".
    Gemeldet wurde es an /admin/roles beim Anklicken einer Rolle.

    Node 21 hat diese Abfrage still umgedreht, ohne dass sich hier eine Zeile
    geändert hätte. Deshalb wird der Zustand jetzt gar nicht mehr beim Rendern
    ermittelt: was der Server nicht wissen kann, darf er nicht raten.
  */
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    // Jetzt ist der Browser da — jetzt darf gefragt werden.
    setIsOffline(!window.navigator.onLine);

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
