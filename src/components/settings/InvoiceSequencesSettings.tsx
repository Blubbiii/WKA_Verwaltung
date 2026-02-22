"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { HelpCircle, Loader2, Save } from "lucide-react";
import {
  useInvoiceSequences,
  updateSequence,
  generatePreviewClient,
  InvoiceSequence,
} from "@/hooks/useInvoiceSequences";

interface SequenceCardProps {
  type: "INVOICE" | "CREDIT_NOTE";
  title: string;
  description: string;
  sequence: InvoiceSequence | undefined;
  onSave: () => void;
}

function SequenceCard({
  type,
  title,
  description,
  sequence,
  onSave,
}: SequenceCardProps) {
  const [format, setFormat] = useState("");
  const [nextNumber, setNextNumber] = useState(1);
  const [digitCount, setDigitCount] = useState(4);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (sequence) {
      setFormat(sequence.format);
      setNextNumber(sequence.nextNumber);
      setDigitCount(sequence.digitCount);
      setHasChanges(false);
    }
  }, [sequence]);

  const preview = format
    ? generatePreviewClient(format, nextNumber, digitCount)
    : "";

  const handleSave = async () => {
    if (!format.includes("{NUMBER}")) {
      toast.error("Format muss {NUMBER} enthalten");
      return;
    }

    try {
      setIsSaving(true);
      await updateSequence(type, {
        format,
        nextNumber,
        digitCount,
      });
      toast.success("Nummernkreis gespeichert");
      setHasChanges(false);
      onSave();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler beim Speichern"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleFormatChange = (value: string) => {
    setFormat(value);
    setHasChanges(true);
  };

  const handleNextNumberChange = (value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0) {
      setNextNumber(num);
      setHasChanges(true);
    }
  };

  const handleDigitCountChange = (value: string) => {
    setDigitCount(parseInt(value, 10));
    setHasChanges(true);
  };

  if (!sequence) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Format */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor={`format-${type}`}>Format</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-2">Verfuegbare Platzhalter:</p>
                  <ul className="text-sm space-y-1">
                    <li>
                      <code>{"{YEAR}"}</code> - Volles Jahr (z.B. 2026)
                    </li>
                    <li>
                      <code>{"{YY}"}</code> - Kurzes Jahr (z.B. 26)
                    </li>
                    <li>
                      <code>{"{NUMBER}"}</code> - Fortlaufende Nummer
                    </li>
                    <li>
                      <code>{"{MONTH}"}</code> - Monat (01-12)
                    </li>
                  </ul>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Beispiele: RG-{"{YEAR}"}-{"{NUMBER}"}, {"{YY}"}-{"{NUMBER}"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            id={`format-${type}`}
            value={format}
            onChange={(e) => handleFormatChange(e.target.value)}
            placeholder="RG-{YEAR}-{NUMBER}"
          />
        </div>

        {/* Nächste Nummer und Stellen */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`nextNumber-${type}`}>Naechste Nummer</Label>
            <Input
              id={`nextNumber-${type}`}
              type="number"
              min={1}
              value={nextNumber}
              onChange={(e) => handleNextNumberChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`digitCount-${type}`}>Stellen</Label>
            <Select
              value={digitCount.toString()}
              onValueChange={handleDigitCountChange}
            >
              <SelectTrigger id={`digitCount-${type}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <SelectItem key={n} value={n.toString()}>
                    {n} {n === 1 ? "Stelle" : "Stellen"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Vorschau */}
        <div className="space-y-2">
          <Label>Vorschau</Label>
          <div className="p-3 bg-muted rounded-md font-mono text-lg">
            {preview || "-"}
          </div>
        </div>

        {/* Speichern */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Speichern
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function InvoiceSequencesSettings() {
  const { sequences, isLoading, isError, mutate } = useInvoiceSequences();

  if (isError) {
    return (
      <div className="p-4 text-red-600 bg-red-50 rounded-md">
        Fehler beim Laden der Nummernkreise
      </div>
    );
  }

  // Sicherstellen, dass sequences ein Array ist
  const sequenceArray = Array.isArray(sequences) ? sequences : [];
  const invoiceSequence = sequenceArray.find((s) => s.type === "INVOICE");
  const creditNoteSequence = sequenceArray.find((s) => s.type === "CREDIT_NOTE");

  return (
    <div className="space-y-6">
      <SequenceCard
        type="INVOICE"
        title="Rechnungsnummer-Format"
        description="Format fuer neue Rechnungen"
        sequence={invoiceSequence}
        onSave={() => mutate()}
      />

      <SequenceCard
        type="CREDIT_NOTE"
        title="Gutschriftsnummer-Format"
        description="Format fuer neue Gutschriften"
        sequence={creditNoteSequence}
        onSave={() => mutate()}
      />
    </div>
  );
}
