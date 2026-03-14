import { redirect } from "next/navigation";

export default function BwaRedirect() {
  redirect("/buchhaltung/berichte?tab=bwa");
}
