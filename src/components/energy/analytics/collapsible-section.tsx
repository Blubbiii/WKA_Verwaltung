"use client";

import { useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  icon?: LucideIcon;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function CollapsibleSection({
  title,
  icon: Icon,
  defaultOpen = true,
  children,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={className}>
      <CollapsibleTrigger className="flex w-full items-center gap-2 py-3 border-b hover:bg-muted/50 transition-colors rounded-t-md px-2 group">
        {Icon && <Icon className="h-5 w-5 text-muted-foreground" />}
        <span className="text-lg font-semibold flex-1 text-left">{title}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-6 pb-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
