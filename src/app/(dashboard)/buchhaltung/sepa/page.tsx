import { redirect } from "next/navigation";

export default function SepaRedirect() {
  redirect("/buchhaltung/zahlungen?tab=sepa");
}
