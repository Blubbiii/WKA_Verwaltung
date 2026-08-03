import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 404 für Adressen, die in keine Routengruppe fallen.
 *
 * ## Warum es diese Datei braucht
 *
 * Es gab bereits `(dashboard)/not-found.tsx` und `(portal)/not-found.tsx` —
 * aber keine auf oberster Ebene. Eine Adresse, die zu keiner Gruppe gehört,
 * landete deshalb bei der eingebauten Seite von Next.js: **englisch, hell,
 * ohne Navigation** — mitten in einer durchgehend deutschen, dunklen
 * Anwendung.
 *
 * Der Bruch ist heftiger als er klingt. Wer sich vertippt, bekommt einen
 * weissen Blitz, einen englischen Satz und keinen Weg zurück. Das sieht nicht
 * nach „Seite gibt es nicht" aus, sondern nach „die Anwendung ist kaputt".
 *
 * ## Warum kein Layout darum herum
 *
 * Diese Seite wird auch dann ausgeliefert, wenn die Adresse zu keiner Gruppe
 * gehört — also ohne Seitenleiste und ohne Sitzung. Sie muss für sich allein
 * stehen können und darf nichts voraussetzen, was es vielleicht nicht gibt.
 * Deshalb bringt sie ihre eigenen Farben mit, statt sich auf ein Layout zu
 * verlassen, das hier gar nicht greift.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-foreground">
      <FileQuestion className="h-16 w-16 text-muted-foreground" aria-hidden />
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-center text-2xl font-semibold">Seite nicht gefunden</h1>
      <p className="max-w-md text-center text-muted-foreground">
        Diese Adresse gibt es nicht. Möglicherweise wurde sie verschoben oder
        Sie haben sich vertippt.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/dashboard">Zum Dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/parks">Zu den Windparks</Link>
        </Button>
      </div>
    </div>
  );
}
