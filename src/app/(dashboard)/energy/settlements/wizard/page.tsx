import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SettlementWizard } from "@/components/energy/settlement-wizard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("energy.settlementsWizard");
  return {
    title: t("metaTitle"),
  };
}

export default function SettlementWizardPage() {
  return <SettlementWizard />;
}
