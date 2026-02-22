"use client";

/**
 * New Billing Rule Page
 * /admin/billing-rules/new
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RuleForm } from "@/components/admin/billing-rules";
import { ArrowLeft } from "lucide-react";

interface Fund {
  id: string;
  name: string;
}

interface Park {
  id: string;
  name: string;
}

export default function NewBillingRulePage() {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [parks, setParks] = useState<Park[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch Funds and Parks for form selects
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [fundsRes, parksRes] = await Promise.all([
          fetch("/api/funds?limit=100"),
          fetch("/api/parks?limit=100"),
        ]);

        if (fundsRes.ok) {
          const fundsData = await fundsRes.json();
          setFunds(fundsData.data || []);
        }

        if (parksRes.ok) {
          const parksData = await parksRes.json();
          setParks(parksData.data || []);
        }
      } catch {
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/billing-rules">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Neue Abrechnungsregel</h1>
          <p className="text-muted-foreground">
            Erstellen Sie eine neue automatische Abrechnungsregel
          </p>
        </div>
      </div>

      {/* Form */}
      <RuleForm funds={funds} parks={parks} />
    </div>
  );
}
