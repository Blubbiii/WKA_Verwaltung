import { redirect } from "next/navigation";

/**
 * `/buchhaltung` — Weiterleitung auf die Berichte.
 *
 * ## Warum es diese Datei gibt
 *
 * Die Navigation führt acht Gruppen; sieben davon zeigen auf eine echte
 * Startseite. `Buchhaltung` war die achte und zeigte auf `/buchhaltung` — eine
 * Adresse, die es nicht gab. Wer sie aufrief, bekam „404 Seite nicht
 * gefunden": über ein Lesezeichen, einen geteilten Link, die Adressleiste oder
 * das Vorausladen von Next.js, das die Adresse aus der Navigationsdefinition
 * kennt.
 *
 * In der Seitenleiste selbst fiel es nicht auf: eine Gruppe mit Unterpunkten
 * wird als Schaltfläche gerendert, nicht als Verweis — der Nutzer klappt sie
 * auf, statt ihr zu folgen. Die tote Adresse blieb dadurch jahrelang
 * unbemerkt, obwohl `NavItem.href` sie als Ziel ausweist.
 *
 * ## Warum eine Weiterleitung und keine Übersichtsseite
 *
 * Die Schwestergruppen haben ausgewachsene Übersichten — `/wirtschaftsplan`
 * etwa mit Kennzahlen und Diagrammen. Eine solche für die Buchhaltung zu
 * erfinden wäre eine Produktentscheidung und keine Fehlerbehebung. Diese Datei
 * macht nur die Adresse gültig; sie steht bewusst niedrig genug, um später
 * durch eine echte Übersicht ersetzt zu werden.
 *
 * Ziel sind die Berichte: der Einstieg, den ein Buchhalter zuerst braucht, und
 * der erste Unterpunkt der Gruppe, der zur Buchhaltung selbst gehört
 * (`Kontenrahmen` davor liegt unter `/admin`).
 */
export default function BuchhaltungStartseite() {
  redirect("/buchhaltung/berichte");
}
