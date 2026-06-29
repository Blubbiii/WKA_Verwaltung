import { redirect } from "next/navigation";

export default function SepaWizardEntry() {
  redirect("/buchhaltung/sepa/new/step-1");
}
