import { redirect } from "next/navigation";

export default function LiquiditaetRedirect() {
  redirect("/buchhaltung/planung?tab=liquiditaet");
}
