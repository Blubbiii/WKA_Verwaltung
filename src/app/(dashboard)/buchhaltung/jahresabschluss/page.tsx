import { redirect } from "next/navigation";

export default function JahresabschlussRedirect() {
  redirect("/buchhaltung/abschluss?tab=jahresabschluss");
}
