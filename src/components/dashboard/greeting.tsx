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

  const isPersonal = t("welcome").includes("Hey") || t("welcome").includes("willkommen");

  // Der Anzeigename, nicht sein erstes Wort.
  //
  // Vorher wurde am Leerzeichen abgeschnitten. Bei „Super Admin" stand auf dem
  // Startbildschirm „Guten Tag, Super" — und das las sich wie eine
  // Verhöhnung. Dasselbe trifft jede Rolle, deren Anzeigename kein Vorname
  // ist: „Guten Tag, Buchhaltung", „Guten Tag, Technischer".
  //
  // Der Vorname ist nur dort richtig, wo er auch einer ist. Steht kein Name
  // zur Verfügung, wird ohne Anrede gegrüsst — das ist besser als eine
  // Begrüssung mit einem leeren Namen dahinter.
  const anzeigename = (session?.user?.name ?? "").trim();
  const anrede = anzeigename ? `, ${anzeigename}` : "";

  const greeting = isPersonal
    ? `${getPersonalTimeGreeting()}${anrede}!`
    : `${getTimeGreeting()}${anrede}`;

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
