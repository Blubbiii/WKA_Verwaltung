"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";

/**
 * Personalized greeting based on time of day and user name.
 * Shows different text based on locale (personal vs. formal).
 */

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "Gute Nacht";
  if (hour < 12) return "Guten Morgen";
  if (hour < 18) return "Guten Tag";
  return "Guten Abend";
}

function getPersonalTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "Hey";
  if (hour < 12) return "Guten Morgen";
  if (hour < 14) return "Mahlzeit";
  if (hour < 18) return "Hey";
  return "Guten Abend";
}

export function DashboardGreeting() {
  const { data: session } = useSession();
  const t = useTranslations("dashboard");

  const firstName = session?.user?.name?.split(" ")[0] ?? "";
  const isPersonal = t("welcome").includes("Hey") || t("welcome").includes("willkommen");

  const greeting = isPersonal
    ? `${getPersonalTimeGreeting()}, ${firstName}!`
    : `${getTimeGreeting()}, ${firstName}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{greeting}</h1>
    </motion.div>
  );
}
