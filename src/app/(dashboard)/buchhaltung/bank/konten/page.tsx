import { redirect } from "next/navigation";

export default function BankKontenRedirect() {
  redirect("/buchhaltung/banking?tab=konten");
}
