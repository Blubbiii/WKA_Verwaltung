"use client";

/**
 * Idee C — PermissionGate Wrapper.
 *
 * Render-Prop-Komponente die einen Button/Action wrappt und je nach
 * Permission-Check entweder normal rendert (allowed) oder mit `disabled=true`
 * + Tooltip (nicht allowed). Der Tooltip enthält den Why-Text, damit User
 * verstehen warum etwas grau ist.
 *
 * Verwendung:
 *   <PermissionGate permission="invoices:update">
 *     {({ disabled, tooltipDisabled }) => (
 *       <Button disabled={disabled} title={tooltipDisabled} onClick={...}>
 *         Bearbeiten
 *       </Button>
 *     )}
 *   </PermissionGate>
 *
 * Während des Initial-Loadings rendert wie "nicht allowed" (disabled, kein
 * Tooltip) — verhindert flackernde Buttons die initial enabled aussehen und
 * dann disabled werden.
 */

import type { ReactNode } from "react";
import { usePermissionGate } from "@/hooks/usePermissionGate";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PermissionGateProps {
  permission: string;
  /** Render-Prop: bekommt {disabled, tooltipDisabled} → muss Button o.ä. zurückgeben. */
  children: (props: {
    disabled: boolean;
    tooltipDisabled?: string;
  }) => ReactNode;
}

export function PermissionGate({ permission, children }: PermissionGateProps) {
  const { allowed, reason } = usePermissionGate(permission);

  if (allowed) {
    return <>{children({ disabled: false })}</>;
  }

  // Während Loading: disabled aber kein Tooltip (Reason ist noch undefined).
  // Nach Load + nicht erlaubt: disabled + Tooltip mit Why.
  const rendered = children({ disabled: true, tooltipDisabled: reason });

  if (!reason) {
    return <>{rendered}</>;
  }

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>{rendered}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs max-w-xs">
          {reason}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
