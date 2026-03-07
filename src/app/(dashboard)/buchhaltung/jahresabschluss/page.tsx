"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  link?: string;
  linkLabel?: string;
}

const CHECKLIST_SECTIONS: Array<{
  title: string;
  items: ChecklistItem[];
}> = [
  {
    title: "1. Kontenabstimmung",
    items: [
      { id: "susa", label: "Summen- und Saldenliste (SuSa) pruefen", description: "Alle Konten auf Richtigkeit und Vollstaendigkeit pruefen", link: "/buchhaltung/susa", linkLabel: "SuSa oeffnen" },
      { id: "bank", label: "Bankabstimmung durchfuehren", description: "Alle Bankkonten mit Kontoauszuegen abgleichen", link: "/buchhaltung/bank", linkLabel: "Bankimport" },
      { id: "kasse", label: "Kassenbestand pruefen", description: "Kassenbuch mit physischem Bestand abgleichen", link: "/buchhaltung/kassenbuch", linkLabel: "Kassenbuch" },
      { id: "debtors", label: "Offene Forderungen abstimmen", description: "OP-Liste Debitoren pruefen und bereinigen" },
      { id: "creditors", label: "Offene Verbindlichkeiten abstimmen", description: "OP-Liste Kreditoren pruefen" },
    ],
  },
  {
    title: "2. Abschluss-Buchungen",
    items: [
      { id: "afa", label: "Abschreibungen (AfA) durchfuehren", description: "AfA-Lauf fuer alle aktiven Anlagen starten", link: "/buchhaltung/anlagen", linkLabel: "Anlagen" },
      { id: "rab", label: "Rechnungsabgrenzung (RAP) buchen", description: "Aktive und passive RAP-Buchungen erstellen" },
      { id: "rueckstellungen", label: "Rueckstellungen bilden", description: "Pensionen, Gewaehrleistungen, Steuern etc." },
      { id: "wertberichtigungen", label: "Wertberichtigungen pruefen", description: "EWB/PWB auf Forderungen bilden" },
    ],
  },
  {
    title: "3. Steuer & Compliance",
    items: [
      { id: "ustva", label: "UStVA-Daten pruefen", description: "Umsatzsteuervoranmeldung(en) abstimmen", link: "/buchhaltung/ustva", linkLabel: "UStVA" },
      { id: "ust-jahreserkl", label: "USt-Jahreserklaerung vorbereiten", description: "Jahressummen fuer ELSTER zusammenstellen" },
      { id: "datev", label: "DATEV-Export erstellen", description: "Buchungsstapel fuer Steuerberater exportieren" },
    ],
  },
  {
    title: "4. Berichte & Dokumentation",
    items: [
      { id: "bwa", label: "BWA Jahresvergleich erstellen", description: "BWA fuer Gesamtjahr generieren und pruefen", link: "/buchhaltung/bwa", linkLabel: "BWA" },
      { id: "bilanz", label: "Bilanz aufstellen", description: "Aktiva/Passiva-Gliederung nach HGB" },
      { id: "guv", label: "GuV fertigstellen", description: "Gewinn- und Verlustrechnung erstellen" },
      { id: "anhang", label: "Anhang und Lagebericht", description: "Erlaeuterungen zum Jahresabschluss verfassen" },
      { id: "protokoll", label: "Gesellschafterbeschluss", description: "Gewinnverwendung / Ergebnisverteilung beschliessen" },
    ],
  },
];

export default function JahresabschlussPage() {
  const [year, setYear] = useState(String(new Date().getFullYear() - 1));
  const [checked, setChecked] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setChecked(next);
  }

  const totalItems = CHECKLIST_SECTIONS.reduce((s, sec) => s + sec.items.length, 0);
  const completedItems = checked.size;
  const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Jahresabschluss" description="Checkliste und Workflow fuer den Jahresabschluss" />

      <div className="flex items-center gap-4">
        <Label>Geschaeftsjahr:</Label>
        <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-[100px]" />
        <Badge variant={progress === 100 ? "default" : "secondary"}>
          {completedItems}/{totalItems} erledigt ({progress}%)
        </Badge>
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {CHECKLIST_SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle className="text-lg">{section.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {section.items.map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  <Checkbox
                    id={item.id}
                    checked={checked.has(item.id)}
                    onCheckedChange={() => toggle(item.id)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <label htmlFor={item.id} className={`font-medium cursor-pointer ${checked.has(item.id) ? "line-through text-muted-foreground" : ""}`}>
                      {item.label}
                    </label>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  {item.link && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={item.link}>{item.linkLabel}</Link>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
