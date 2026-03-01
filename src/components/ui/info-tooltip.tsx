"use client";

import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
  text: string;
  className?: string;
  iconClassName?: string;
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * Small (i) icon that shows a tooltip on hover.
 * Use next to section headers to explain domain-specific terms.
 */
export function InfoTooltip({
  text,
  className,
  iconClassName,
  side = "top",
}: InfoTooltipProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex cursor-help text-muted-foreground hover:text-foreground transition-colors",
              className
            )}
          >
            <Info className={cn("h-4 w-4", iconClassName)} />
          </span>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          className="max-w-xs text-sm font-normal leading-relaxed"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
