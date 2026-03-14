import { redirect } from "next/navigation";

export default function SuSaRedirect() {
  redirect("/buchhaltung/berichte?tab=susa");
}
