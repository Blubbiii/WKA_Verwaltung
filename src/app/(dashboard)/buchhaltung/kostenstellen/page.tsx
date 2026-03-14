import { redirect } from "next/navigation";

export default function KostenstellenRedirect() {
  redirect("/buchhaltung/planung?tab=kostenstellen");
}
