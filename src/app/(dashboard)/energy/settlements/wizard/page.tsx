import { Metadata } from "next";
import { SettlementWizard } from "@/components/energy/settlement-wizard";

export const metadata: Metadata = {
  title: "Abrechnung erstellen",
};

export default function SettlementWizardPage() {
  return <SettlementWizard />;
}
