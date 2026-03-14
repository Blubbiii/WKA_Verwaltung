import { redirect } from "next/navigation";

export default function EuerRedirect() {
  redirect("/buchhaltung/berichte?tab=euer");
}
