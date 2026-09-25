"use client";

import { useTranslations } from "next-intl";
import { istVerschluesselterRohwert } from "@/lib/format";

/**
 * IBAN + bank name of a lessor. When decryption failed on the server the
 * fields arrive as ciphertext; show a hint instead of the raw string.
 */
export function BankverbindungAnzeige({
  iban,
  bankName,
}: {
  iban: string;
  bankName?: string | null;
}) {
  const t = useTranslations("leases.detail.lessor");

  if (istVerschluesselterRohwert(iban) || istVerschluesselterRohwert(bankName)) {
    return (
      <>
        <p className="font-medium text-sm">{t("bankUnreadable")}</p>
        <p className="text-xs text-muted-foreground">{t("bankUnreadableHint")}</p>
      </>
    );
  }

  return (
    <>
      <p className="font-medium font-mono text-sm break-all">{iban}</p>
      {bankName && <p className="text-sm text-muted-foreground">{bankName}</p>}
    </>
  );
}
