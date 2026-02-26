"use client";

import { useState, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Loader2,
  QrCode,
  Printer,
  RefreshCw,
  Trash2,
  Copy,
  Check,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface TurbineQrCodeTabProps {
  turbineId: string;
  qrToken: string | null | undefined;
  turbineDesignation: string;
  parkName: string | undefined;
  onTokenChanged: () => void;
}

export function TurbineQrCodeTab({
  turbineId,
  qrToken,
  turbineDesignation,
  parkName,
  onTokenChanged,
}: TurbineQrCodeTabProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copied, setCopied] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const checkInUrl = qrToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/techniker/${qrToken}`
    : null;

  async function generateToken() {
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/turbines/${turbineId}/qr-token`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Fehler beim Generieren");
      toast.success("QR-Code wurde generiert");
      onTokenChanged();
    } catch {
      toast.error("Fehler beim Generieren des QR-Codes");
    } finally {
      setIsGenerating(false);
    }
  }

  async function deleteToken() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/turbines/${turbineId}/qr-token`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Fehler beim Entfernen");
      toast.success("QR-Code wurde deaktiviert");
      onTokenChanged();
    } catch {
      toast.error("Fehler beim Deaktivieren des QR-Codes");
    } finally {
      setIsDeleting(false);
    }
  }

  function copyUrl() {
    if (!checkInUrl) return;
    navigator.clipboard.writeText(checkInUrl).then(() => {
      setCopied(true);
      toast.success("URL kopiert");
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handlePrint() {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Popup-Blocker verhindert das Drucken");
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR-Code - ${turbineDesignation}</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 40px; }
          .label { font-size: 24px; font-weight: bold; margin-bottom: 8px; }
          .sublabel { font-size: 16px; color: #666; margin-bottom: 24px; }
          .qr { margin: 24px auto; }
          .url { font-size: 10px; color: #999; margin-top: 16px; word-break: break-all; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="label">${turbineDesignation}</div>
        <div class="sublabel">${parkName ?? ""}</div>
        ${printRef.current.innerHTML}
        <div class="url">${checkInUrl}</div>
        <script>window.print(); window.close();</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  // No token yet
  if (!qrToken) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4 text-center">
        <QrCode className="h-12 w-12 text-muted-foreground" />
        <div>
          <p className="font-medium">Kein QR-Code vorhanden</p>
          <p className="text-sm text-muted-foreground mt-1">
            Generieren Sie einen QR-Code, damit Techniker sich an dieser Anlage
            ein- und auschecken können.
          </p>
        </div>
        <Button onClick={generateToken} disabled={isGenerating}>
          {isGenerating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <QrCode className="mr-2 h-4 w-4" />
          )}
          QR-Code generieren
        </Button>
      </div>
    );
  }

  // Token exists — show QR code
  return (
    <div className="space-y-6">
      {/* QR Code */}
      <div className="flex flex-col items-center space-y-4">
        <div ref={printRef} className="qr">
          <QRCodeSVG
            value={checkInUrl!}
            size={200}
            level="M"
            includeMargin
          />
        </div>
        <p className="text-sm text-muted-foreground text-center">
          Techniker scannen diesen QR-Code, um sich ein- und auszuchecken.
        </p>
      </div>

      {/* URL */}
      <div className="flex items-center gap-2">
        <Input value={checkInUrl ?? ""} readOnly className="text-xs font-mono" />
        <Button variant="outline" size="icon" onClick={copyUrl}>
          {copied ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />
          Drucken
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={isGenerating}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Erneuern
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>QR-Code erneuern?</AlertDialogTitle>
              <AlertDialogDescription>
                Der bestehende QR-Code wird ungültig. Bereits gedruckte QR-Codes
                funktionieren danach nicht mehr.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={generateToken}>
                Erneuern
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="text-destructive" disabled={isDeleting}>
              <Trash2 className="mr-2 h-4 w-4" />
              Deaktivieren
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>QR-Code deaktivieren?</AlertDialogTitle>
              <AlertDialogDescription>
                Techniker können sich danach nicht mehr über den QR-Code
                einchecken. Sie können jederzeit einen neuen QR-Code generieren.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                onClick={deleteToken}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Deaktivieren
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
