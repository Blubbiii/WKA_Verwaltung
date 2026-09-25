"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FundCreateForm } from "@/components/funds/fund-create-form";

export default function NewFundPage() {
  const router = useRouter();
  const t = useTranslations("funds");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button aria-label="Zurück" variant="ghost" size="icon" asChild>
          <Link href="/funds">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("form.newTitle")}</h1>
          <p className="text-muted-foreground">
            {t("form.newDescription")}
          </p>
        </div>
      </div>

      <FundCreateForm
        onCreated={(fund) => {
          router.push(`/funds/${fund.id}`);
          router.refresh();
        }}
        onCancel={() => router.back()}
      />
    </div>
  );
}
