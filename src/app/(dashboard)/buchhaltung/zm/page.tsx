import { redirect } from "next/navigation";

export default function ZmRedirect() {
  redirect("/buchhaltung/steuern?tab=zm");
}
