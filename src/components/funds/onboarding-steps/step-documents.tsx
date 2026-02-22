"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, X, FileText, FileImage, File } from "lucide-react";
import type { DocumentsData, DocumentFile } from "../onboarding-types";

interface StepDocumentsProps {
  data: DocumentsData;
  onChange: (data: DocumentsData) => void;
}

const DOCUMENT_SLOTS = [
  {
    label: "Beitrittserklaerung",
    category: "CONTRACT",
    description: "Unterzeichnete Beitrittserklaerung des Gesellschafters",
  },
  {
    label: "Gesellschaftsvertrag",
    category: "CONTRACT",
    description: "Kopie des Gesellschaftsvertrags (falls individuell)",
  },
  {
    label: "Personalausweis-Kopie",
    category: "OTHER",
    description: "Kopie des Personalausweises zur Identitaetspruefung",
  },
];

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const MAX_SIZE_MB = 20;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType === "application/pdf") return FileText;
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function StepDocuments({ data, onChange }: StepDocumentsProps) {
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  function handleFileSelect(slotLabel: string, category: string, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      alert("Dateityp nicht erlaubt. Erlaubt: PDF, JPG, PNG, WebP, DOC, DOCX");
      return;
    }

    // Validate size
    if (file.size > MAX_SIZE_BYTES) {
      alert(`Datei zu gross. Maximal ${MAX_SIZE_MB} MB erlaubt.`);
      return;
    }

    // Replace or add file for this slot
    const existingIndex = data.files.findIndex((f) => f.label === slotLabel);
    const newFile: DocumentFile = { file, label: slotLabel, category };

    const updatedFiles = [...data.files];
    if (existingIndex >= 0) {
      updatedFiles[existingIndex] = newFile;
    } else {
      updatedFiles.push(newFile);
    }

    onChange({ files: updatedFiles });

    // Reset file input
    if (fileInputRefs.current[slotLabel]) {
      fileInputRefs.current[slotLabel]!.value = "";
    }
  }

  function handleRemoveFile(slotLabel: string) {
    onChange({
      files: data.files.filter((f) => f.label !== slotLabel),
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Dokumente</h3>
        <p className="text-sm text-muted-foreground">
          Laden Sie optionale Dokumente zum Onboarding hoch. Alle Felder sind optional.
        </p>
      </div>

      <div className="space-y-4">
        {DOCUMENT_SLOTS.map((slot) => {
          const uploadedFile = data.files.find((f) => f.label === slot.label);
          const FileIcon = uploadedFile ? getFileIcon(uploadedFile.file.type) : Upload;

          return (
            <div
              key={slot.label}
              className="rounded-lg border p-4"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">{slot.label}</Label>
                  <p className="text-xs text-muted-foreground">{slot.description}</p>
                </div>

                {uploadedFile && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemoveFile(slot.label)}
                    aria-label={`${slot.label} entfernen`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {uploadedFile ? (
                <div className="mt-3 flex items-center gap-3 rounded-md bg-muted/50 p-3">
                  <FileIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{uploadedFile.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(uploadedFile.file.size)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-3">
                  <input
                    ref={(el) => { fileInputRefs.current[slot.label] = el; }}
                    type="file"
                    accept={ALLOWED_TYPES.join(",")}
                    className="hidden"
                    id={`file-${slot.label}`}
                    onChange={(e) => handleFileSelect(slot.label, slot.category, e)}
                  />
                  <Button
                    variant="outline"
                    className="w-full justify-center gap-2 border-dashed"
                    onClick={() => fileInputRefs.current[slot.label]?.click()}
                    type="button"
                  >
                    <Upload className="h-4 w-4" />
                    Datei auswaehlen
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Erlaubte Dateitypen: PDF, JPG, PNG, WebP, DOC, DOCX. Maximale Groesse: {MAX_SIZE_MB} MB pro Datei.
      </p>
    </div>
  );
}
