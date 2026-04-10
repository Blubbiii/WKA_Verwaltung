"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

interface ChecklistItem {
  id: string;
  labelKey: string;
  descKey: string;
  link?: string;
  linkLabelKey?: string;
}

interface ChecklistSection {
  titleKey: string;
  items: ChecklistItem[];
}

const CHECKLIST_SECTIONS: ChecklistSection[] = [
  {
    titleKey: "section1Title",
    items: [
      { id: "susa", labelKey: "susaLabel", descKey: "susaDesc", link: "/buchhaltung/berichte?tab=susa", linkLabelKey: "susaLinkLabel" },
      { id: "bank", labelKey: "bankLabel", descKey: "bankDesc", link: "/buchhaltung/bank", linkLabelKey: "bankLinkLabel" },
      { id: "kasse", labelKey: "kasseLabel", descKey: "kasseDesc", link: "/buchhaltung/kassenbuch", linkLabelKey: "kasseLinkLabel" },
      { id: "debtors", labelKey: "debtorsLabel", descKey: "debtorsDesc" },
      { id: "creditors", labelKey: "creditorsLabel", descKey: "creditorsDesc" },
    ],
  },
  {
    titleKey: "section2Title",
    items: [
      { id: "afa", labelKey: "afaLabel", descKey: "afaDesc", link: "/buchhaltung/anlagen", linkLabelKey: "afaLinkLabel" },
      { id: "rab", labelKey: "rabLabel", descKey: "rabDesc" },
      { id: "rueckstellungen", labelKey: "rueckstellungenLabel", descKey: "rueckstellungenDesc" },
      { id: "wertberichtigungen", labelKey: "wertberichtigungenLabel", descKey: "wertberichtigungenDesc" },
    ],
  },
  {
    titleKey: "section3Title",
    items: [
      { id: "ustva", labelKey: "ustvaLabel", descKey: "ustvaDesc", link: "/buchhaltung/steuern?tab=ustva", linkLabelKey: "ustvaLinkLabel" },
      { id: "ust-jahreserkl", labelKey: "ustJahreserklLabel", descKey: "ustJahreserklDesc" },
      { id: "datev", labelKey: "datevLabel", descKey: "datevDesc", link: "/buchhaltung/abschluss?tab=datev", linkLabelKey: "datevLinkLabel" },
    ],
  },
  {
    titleKey: "section4Title",
    items: [
      { id: "bwa", labelKey: "bwaLabel", descKey: "bwaDesc", link: "/buchhaltung/berichte?tab=bwa", linkLabelKey: "bwaLinkLabel" },
      { id: "bilanz", labelKey: "bilanzLabel", descKey: "bilanzDesc" },
      { id: "guv", labelKey: "guvLabel", descKey: "guvDesc" },
      { id: "anhang", labelKey: "anhangLabel", descKey: "anhangDesc" },
      { id: "protokoll", labelKey: "protokollLabel", descKey: "protokollDesc" },
    ],
  },
];

export default function JahresabschlussContent() {
  const t = useTranslations("buchhaltung.abschlussJahresabschluss");
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
    <>
      <div className="flex items-center gap-4">
        <Label>{t("fiscalYearLabel")}</Label>
        <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-[100px]" />
        <Badge variant={progress === 100 ? "default" : "secondary"}>
          {t("progressDone", { completed: completedItems, total: totalItems, progress })}
        </Badge>
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {CHECKLIST_SECTIONS.map((section) => (
        <Card key={section.titleKey}>
          <CardHeader>
            <CardTitle className="text-lg">{t(section.titleKey)}</CardTitle>
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
                      {t(item.labelKey)}
                    </label>
                    <p className="text-sm text-muted-foreground">{t(item.descKey)}</p>
                  </div>
                  {item.link && item.linkLabelKey && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={item.link}>{t(item.linkLabelKey)}</Link>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}
