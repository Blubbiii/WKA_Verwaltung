"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { MapAnnotationData } from "./MapAnnotationLayer";

const ANNOTATION_TYPE_VALUES = [
  { value: "CABLE_ROUTE", labelKey: "typeCableRoute", color: "#eab308" },
  { value: "COMPENSATION_AREA", labelKey: "compensationArea", color: "#22c55e" },
  { value: "ACCESS_ROAD", labelKey: "typeAccessRoad", color: "#d97706" },
  { value: "EXCLUSION_ZONE", labelKey: "typeExclusionZone", color: "#ef4444" },
  { value: "CUSTOM", labelKey: "typeCustom", color: "#6366f1" },
] as const;

interface AnnotationEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  annotation: MapAnnotationData | null;
  parkId: string;
  onSaved: () => void;
}

export function AnnotationEditDialog({
  open,
  onOpenChange,
  annotation,
  parkId,
  onSaved,
}: AnnotationEditDialogProps) {
  const tToast = useTranslations("maps.toasts");
  const t = useTranslations("maps.annotation");
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("CUSTOM");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Pre-fill form when annotation changes
  useEffect(() => {
    if (annotation) {
      setName(annotation.name);
      setType(annotation.type);
      setDescription(annotation.description ?? "");
    }
  }, [annotation]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(tToast("nameRequired"));
      return;
    }
    if (!annotation) return;

    setSaving(true);
    try {
      const res = await fetch(
        `/api/parks/${parkId}/annotations/${annotation.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            type,
            description: description.trim() || null,
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || tToast("saveError"));
      }

      toast.success(tToast("annotationUpdated"));
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tToast("saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-anno-name">{t("nameLabel")}</Label>
            <Input
              id="edit-anno-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("typeLabel")}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANNOTATION_TYPE_VALUES.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block w-3 h-3 rounded-full"
                        style={{ backgroundColor: opt.color }}
                      />
                      {t(opt.labelKey)}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-anno-desc">{t("descriptionLabel")}</Label>
            <Textarea
              id="edit-anno-desc"
              placeholder={t("descriptionPlaceholder")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("update")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
