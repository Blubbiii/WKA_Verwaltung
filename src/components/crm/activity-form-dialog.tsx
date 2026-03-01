"use client";

import { useState } from "react";
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

const TYPE_OPTIONS: { value: ActivityType; label: string; icon: React.ElementType }[] = [
  { value: "CALL", label: "Anruf", icon: Phone },
  { value: "EMAIL", label: "E-Mail", icon: Mail },
  { value: "MEETING", label: "Meeting", icon: CalendarDays },
  { value: "NOTE", label: "Notiz", icon: FileText },
  { value: "TASK", label: "Aufgabe", icon: CheckSquare },
];

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
      toast.error("Titel ist erforderlich");
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
        throw new Error(err.error ?? "Unbekannter Fehler");
      }

      toast.success(isEdit ? "Aktivität aktualisiert" : "Aktivität erstellt");
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fehler beim Speichern");
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
          <DialogTitle>{isEdit ? "Aktivität bearbeiten" : "Aktivität hinzufügen"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type */}
          {!isEdit && (
            <div className="space-y-1.5">
              <Label>Typ</Label>
              <Select value={type} onValueChange={(v) => setType(v as ActivityType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className="flex items-center gap-2">
                        <opt.icon className="h-4 w-4" />
                        {opt.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="act-title">Titel *</Label>
            <Input
              id="act-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                type === "CALL" ? "Anruf mit Max Müller" :
                type === "EMAIL" ? "E-Mail zu Dividendenausschüttung" :
                type === "MEETING" ? "Jahresgespräch Q1" :
                type === "TASK" ? "Pachtvertrag verlängern" :
                "Notiz..."
              }
            />
          </div>

          {/* Direction */}
          {showDirection && (
            <div className="space-y-1.5">
              <Label>Richtung</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as "INBOUND" | "OUTBOUND")}>
                <SelectTrigger>
                  <SelectValue placeholder="Richtung wählen..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INBOUND">Eingehend</SelectItem>
                  <SelectItem value="OUTBOUND">Ausgehend</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* StartTime */}
          {showStartTime && (
            <div className="space-y-1.5">
              <Label htmlFor="act-start">Datum &amp; Uhrzeit</Label>
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
              <Label htmlFor="act-duration">Dauer (Minuten)</Label>
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
              <Label htmlFor="act-due">Fällig am</Label>
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
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ActivityStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Offen</SelectItem>
                  <SelectItem value="DONE">Erledigt</SelectItem>
                  <SelectItem value="CANCELLED">Abgebrochen</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="act-desc">Beschreibung</Label>
            <Textarea
              id="act-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Details zur Aktivität..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Speichern..." : isEdit ? "Aktualisieren" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
