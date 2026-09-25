/** How the "first steps" card is shown for a given progress. */
export function onboardingAnzeige(erledigt: number, gesamt: number): "aus" | "kompakt" | "voll" {
  if (gesamt === 0 || erledigt >= gesamt) return "aus";
  return erledigt / gesamt >= 0.8 ? "kompakt" : "voll";
}
