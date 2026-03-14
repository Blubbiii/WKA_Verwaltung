import { redirect } from "next/navigation";

export default function MahnwesenRedirect() {
  redirect("/buchhaltung/zahlungen?tab=mahnwesen");
}
