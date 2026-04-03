import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

/**
 * Enhanced success toast with celebration styling.
 * Drop-in replacement for toast.success() at key moments.
 *
 * Usage:
 * ```ts
 * import { celebrationToast } from "@/lib/celebration-toast";
 * celebrationToast("Rechnung erstellt!");
 * ```
 */
export function celebrationToast(message: string, description?: string) {
  toast.success(message, {
    description,
    icon: <CheckCircle2 className="h-5 w-5 text-success animate-in zoom-in-50 duration-300" />,
    duration: 3000,
    className: "celebration-toast",
  });
}
