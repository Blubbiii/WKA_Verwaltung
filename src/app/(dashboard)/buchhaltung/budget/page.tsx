import { redirect } from "next/navigation";

export default function BudgetRedirect() {
  redirect("/buchhaltung/planung?tab=budget");
}
