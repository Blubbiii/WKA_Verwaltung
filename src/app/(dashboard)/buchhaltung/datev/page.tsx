import { redirect } from "next/navigation";

export default function DatevRedirect() {
  redirect("/buchhaltung/abschluss?tab=datev");
}
