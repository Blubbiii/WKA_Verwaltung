"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Phone, Mail, CalendarDays, FileText, CheckSquare } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ============================================================================
// Types
// ============================================================================

export type ActivityType = "CALL" | "EMAIL" | "MEETING" | "NOTE" | "TASK";
export type ActivityStatus = "DONE" | "PENDING" | "CANCELLED";

export interface ActivityFormData {
  type: ActivityType;
  title: string;
  description?: string;
  status: ActivityStatus;
  direction?: "INBOUND" | "OUTBOUND";
  duration?: number;
  startTime?: string;
  dueDate?: string;
  assignedToId?: string;
}

interface ActivityFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: "person" | "fund" | "lease" | "park";
  entityId: string;
  activity?: { id: string } & ActivityFormData;
  onSuccess?: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const TYPE_ICONS: Record<ActivityType, React.ElementType> = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: CalendarDays,
  NOTE: FileText,
  TASK: CheckSquare,
};

const TYPE_VALUES: ActivityType[] = ["CALL", "EMAIL", "MEETING", "NOTE", "TASK"];

// ============================================================================
// Component
// ============================================================================

export function ActivityFormDialog({
  open,
  onOpenChange,
  entityType,
  entityId,
  activity,
  onSuccess,
}: ActivityFormDialogProps) {
  const t = useTranslations("activityForm");
  const tc = useTranslations("common");
  const isEdit = !!activity;

  const [type, setType] = useState<ActivityType>(activity?.type ?? "NOTE");
  const [title, setTitle] = useState(activity?.title ?? "");
  const [description, setDescription] = useState(activity?.description ?? "");
  const [status, setStatus] = useState<ActivityStatus>(activity?.status ?? "DONE");
  const [direction, setDirection] = useState<"INBOUND" | "OUTBOUND" | "">(
    (activity?.direction as "INBOUND" | "OUTBOUND") ?? ""
  );
  const [duration, setDuration] = useState(activity?.duration?.toString() ?? "");
  const [startTime, setStartTime] = useState(
    activity?.startTime ? activity.startTime.slice(0, 16) : ""
  );
  const [dueDate, setDueDate] = useState(
    activity?.dueDate ? activity.dueDate.slice(0, 16) : ""
  );
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error(t("toast.titleRequired"));
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        type,
        title: title.trim(),
        description: description.trim() || undefined,
        status,
      };

      if (direction) body.direction = direction;
      if (duration) body.duration = parseInt(duration);
      if (startTime) body.startTime = new Date(startTime).toISOString();
      if (dueDate) body.dueDate = new Date(dueDate).toISOString();

      if (!isEdit) {
        body[`${entityType}Id`] = entityId;
      }

      const url = isEdit
        ? `/api/crm/activities/${activity.id}`
        : "/api/crm/activities";

      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? t("toast.saveError"));
      }

      toast.success(isEdit ? t("toast.updated") : t("toast.created"));
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toast.saveError"));
    } finally {
      setLoading(false);
    }
  };

  const showDirection = type === "CALL" || type === "EMAIL";
  const showDuration = type === "CALL" || type === "MEETING";
  const showStartTime = type === "CALL" || type === "MEETING";
  const showDueDate = type === "TASK";
  const showStatus = type === "TASK";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editTitle") : t("addTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type */}
          {!isEdit && (
            <div className="space-y-1.5">
              <Label>{t("typeLabel")}</Label>
              <Select value={type} onValueChange={(v) => setType(v as ActivityType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_VALUES.map((typeVal) => {
                    const Icon = TYPE_ICONS[typeVal];
                    return (
                      <SelectItem key={typeVal} value={typeVal}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {t(`type.${typeVal}`)}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="act-title">{t("titleLabel")}</Label>
            <Input
              id="act-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t(`placeholder.${type}`)}
            />
          </div>

          {/* Direction */}
          {showDirection && (
            <div className="space-y-1.5">
              <Label>{t("directionLabel")}</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as "INBOUND" | "OUTBOUND")}>
                <SelectTrigger>
                  <SelectValue placeholder={t("directionPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INBOUND">{t("direction.INBOUND")}</SelectItem>
                  <SelectItem value="OUTBOUND">{t("direction.OUTBOUND")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* StartTime */}
          {showStartTime && (
            <div className="space-y-1.5">
              <Label htmlFor="act-start">{t("startTimeLabel")}</Label>
              <Input
                id="act-start"
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
          )}

          {/* Duration */}
          {showDuration && (
            <div className="space-y-1.5">
              <Label htmlFor="act-duration">{t("durationLabel")}</Label>
              <Input
                id="act-duration"
                type="number"
                min={1}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="15"
              />
            </div>
          )}

          {/* DueDate (Tasks) */}
          {showDueDate && (
            <div className="space-y-1.5">
              <Label htmlFor="act-due">{t("dueDateLabel")}</Label>
              <Input
                id="act-due"
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          )}

          {/* Status (Tasks) */}
          {showStatus && (
            <div className="space-y-1.5">
              <Label>{t("statusLabel")}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ActivityStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">{t("status.PENDING")}</SelectItem>
                  <SelectItem value="DONE">{t("status.DONE")}</SelectItem>
                  <SelectItem value="CANCELLED">{t("status.CANCELLED")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="act-desc">{t("descriptionLabel")}</Label>
            <Textarea
              id="act-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t("descriptionPlaceholder")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {tc("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? tc("loading") : isEdit ? tc("save") : tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
