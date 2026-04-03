"use client";

import { useState, useCallback } from "react";

/**
 * Hook for success celebrations — combines SuccessAnimation with optional toast.
 *
 * Usage:
 * ```tsx
 * const { celebrate, showAnimation, clearAnimation } = useSuccessCelebration();
 *
 * // After a successful action:
 * celebrate("Rechnung erstellt!");
 *
 * // In JSX:
 * <SuccessAnimation show={showAnimation} message={message} onComplete={clearAnimation} />
 * ```
 */
export function useSuccessCelebration() {
  const [showAnimation, setShowAnimation] = useState(false);
  const [message, setMessage] = useState("Gespeichert!");

  const celebrate = useCallback((msg?: string) => {
    setMessage(msg ?? "Gespeichert!");
    setShowAnimation(true);
  }, []);

  const clearAnimation = useCallback(() => {
    setShowAnimation(false);
  }, []);

  return { celebrate, showAnimation, message, clearAnimation };
}
