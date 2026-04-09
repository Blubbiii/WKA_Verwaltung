"use client";

import { useEffect, useState } from "react";
import { Plus, X, Tag as TagIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

export interface PersonTag {
  id: string;
  name: string;
  color: string | null;
}

interface PersonTagsProps {
  personId: string;
  tags: PersonTag[];
  onChange: (tags: PersonTag[]) => void;
}

/**
 * Tag badge list + popover for adding / removing tags on a Person.
 * Fetches all available tenant tags on open and supports creating new ones inline.
 */
export function PersonTags({ personId, tags, onChange }: PersonTagsProps) {
  const [allTags, setAllTags] = useState<PersonTag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [creating, setCreating] = useState(false);

  const loadTags = async () => {
    setLoadingTags(true);
    try {
      const res = await fetch("/api/crm/tags");
      if (res.ok) setAllTags(await res.json());
    } finally {
      setLoadingTags(false);
    }
  };

  useEffect(() => {
    if (popoverOpen) loadTags();
  }, [popoverOpen]);

  const attach = async (tag: PersonTag) => {
    try {
      const res = await fetch(`/api/crm/contacts/${personId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId: tag.id }),
      });
      if (!res.ok) throw new Error();
      onChange([...tags, tag]);
    } catch {
      toast.error("Fehler beim Zuweisen");
    }
  };

  const detach = async (tagId: string) => {
    try {
      const res = await fetch(
        `/api/crm/contacts/${personId}/tags?tagId=${tagId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error();
      onChange(tags.filter((t) => t.id !== tagId));
    } catch {
      toast.error("Fehler beim Entfernen");
    }
  };

  const createAndAttach = async () => {
    if (!newTagName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/crm/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTagName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Fehler");
      }
      const tag: PersonTag = await res.json();
      setAllTags([...allTags, tag]);
      await attach(tag);
      setNewTagName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler");
    } finally {
      setCreating(false);
    }
  };

  const attachedIds = new Set(tags.map((t) => t.id));
  const availableToAttach = allTags.filter((t) => !attachedIds.has(t.id));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((t) => (
        <Badge
          key={t.id}
          variant="secondary"
          className="gap-1 pr-1"
          style={t.color ? { backgroundColor: `${t.color}20`, color: t.color } : undefined}
        >
          <TagIcon className="h-3 w-3" />
          {t.name}
          <button
            onClick={() => detach(t.id)}
            className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5"
            aria-label={`Tag ${t.name} entfernen`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}

      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
            <Plus className="h-3 w-3 mr-1" />
            Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start">
          <div className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground">
              Verfügbare Tags
            </div>
            {loadingTags ? (
              <div className="text-xs text-muted-foreground">Lade...</div>
            ) : availableToAttach.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                Keine weiteren Tags vorhanden
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {availableToAttach.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => attach(t)}
                    className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs hover:bg-muted"
                  >
                    <TagIcon className="h-3 w-3" />
                    {t.name}
                  </button>
                ))}
              </div>
            )}

            <div className="border-t pt-3">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Neuen Tag anlegen
              </div>
              <div className="flex gap-2">
                <Input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="z.B. VIP"
                  className="h-8 text-xs"
                  onKeyDown={(e) => e.key === "Enter" && createAndAttach()}
                />
                <Button
                  size="sm"
                  onClick={createAndAttach}
                  disabled={creating || !newTagName.trim()}
                >
                  {creating ? "..." : "Anlegen"}
                </Button>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
