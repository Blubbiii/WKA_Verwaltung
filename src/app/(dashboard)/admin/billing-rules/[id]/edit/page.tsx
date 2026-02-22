"use client";

/**
 * Edit Billing Rule Page
 * /admin/billing-rules/[id]/edit
 */

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RuleForm } from "@/components/admin/billing-rules";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

interface Fund {
  id: string;
  name: string;
}

interface Park {
  id: string;
  name: string;
}

interface BillingRule {
  id: string;
  name: string;
  description: string | null;
  ruleType: "LEASE_PAYMENT" | "DISTRIBUTION" | "MANAGEMENT_FEE" | "CUSTOM";
  frequency: "MONTHLY" | "QUARTERLY" | "SEMI_ANNUAL" | "ANNUAL" | "CUSTOM_CRON";
  cronPattern: string | null;
  dayOfMonth: number | null;
  parameters: Record<string, unknown>;
  isActive: boolean;
}

export default function EditBillingRulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [rule, setRule] = useState<BillingRule | null>(null);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [parks, setParks] = useState<Park[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch Rule, Funds and Parks
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ruleRes, fundsRes, parksRes] = await Promise.all([
          fetch(`/api/admin/billing-rules/${id}`),
          fetch("/api/funds?limit=100"),
          fetch("/api/parks?limit=100"),
        ]);

        if (!ruleRes.ok) {
          if (ruleRes.status === 404) {
            toast.error("Regel nicht gefunden");
            router.push("/admin/billing-rules");
            return;
          }
          throw new Error("Fehler beim Laden");
        }

        const ruleData = await ruleRes.json();
        setRule(ruleData);

        if (fundsRes.ok) {
          const fundsData = await fundsRes.json();
          setFunds(fundsData.data || []);
        }

        if (parksRes.ok) {
          const parksData = await parksRes.json();
          setParks(parksData.data || []);
        }
      } catch (error) {
        toast.error("Fehler beim Laden der Daten");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id, router]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!rule) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/admin/billing-rules/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Regel bearbeiten</h1>
          <p className="text-muted-foreground">{rule.name}</p>
        </div>
      </div>

      {/* Form */}
      <RuleForm
        initialData={rule}
        funds={funds}
        parks={parks}
        onSuccess={() => router.push(`/admin/billing-rules/${id}`)}
      />
    </div>
  );
}
