import { redirect } from "next/navigation";

export default function UstvaRedirect() {
  redirect("/buchhaltung/steuern?tab=ustva");
}
