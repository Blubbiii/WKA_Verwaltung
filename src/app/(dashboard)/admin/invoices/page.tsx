import { redirect } from "next/navigation";

export default function Page() {
  redirect("/admin/billing?tab=nummernkreise");
}
