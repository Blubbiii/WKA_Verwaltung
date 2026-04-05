"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Sidebar } from "./sidebar";

/**
 * Mobile sidebar — wraps the Sidebar component in a Sheet drawer.
 * Uses external store pattern for open state (callable from Header without Context).
 */

// External store for sidebar open state
let isOpen = false;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot() {
  return isOpen;
}

function getServerSnapshot() {
  return false;
}

function setIsOpen(next: boolean) {
  if (isOpen === next) return;
  isOpen = next;
  listeners.forEach((cb) => cb());
}

export function openMobileSidebar() {
  setIsOpen(true);
}

// Legacy alias for existing Header import
export function getMobileSidebarOpener() {
  return openMobileSidebar;
}

export function MobileSidebar() {
  const open = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const pathname = usePathname();

  // Close drawer when pathname changes (navigation). This is a legitimate
  // external-store sync, not React state — the ESLint rule targets React
  // state setters, and setIsOpen is a plain module-level function.
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setIsOpen}>
      <SheetContent side="left" className="p-0 w-72 sm:w-80">
        <VisuallyHidden>
          <SheetTitle>Navigation</SheetTitle>
        </VisuallyHidden>
        <Sidebar />
      </SheetContent>
    </Sheet>
  );
}
