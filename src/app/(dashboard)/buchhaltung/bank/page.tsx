import { redirect } from "next/navigation";

export default function BankRedirect() {
  redirect("/buchhaltung/banking?tab=import");
}
