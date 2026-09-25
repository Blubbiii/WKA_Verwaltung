/** Offer the tour only on the dashboard, and only until done or declined. */
export function rundgangAnbieten(s: { isLoaded: boolean; shouldAutoTrigger: boolean; pathname: string }): boolean {
  return s.isLoaded && s.shouldAutoTrigger && s.pathname === "/dashboard";
}
