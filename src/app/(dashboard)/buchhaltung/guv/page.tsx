import { redirect } from "next/navigation";

export default function GuvRedirect() {
  redirect("/buchhaltung/berichte?tab=guv");
}
