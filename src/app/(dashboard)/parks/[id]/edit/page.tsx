"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ParkForm } from "@/components/parks/park-form";

interface Park {
  id: string;
  name: string;
  shortName: string | null;
  description: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  commissioningDate: string | null;
  totalCapacityKw: number | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  settlementArticles: { type: string; label: string; taxRate: number; accountNumber: string }[] | null;
  defaultPaymentDay: number | null;
}

export default function EditParkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [park, setPark] = useState<Park | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPark() {
      try {
        const response = await fetch(`/api/parks/${id}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError("Park nicht gefunden");
          } else {
            throw new Error("Fehler beim Laden");
          }
          return;
        }
        const data = await response.json();
        setPark(data);
      } catch (err) {
        setError("Fehler beim Laden des Parks");
      } finally {
        setLoading(false);
      }
    }
    fetchPark();
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="mt-2 h-4 w-48" />
          </div>
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !park) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-lg text-muted-foreground">{error}</p>
        <Button asChild className="mt-4">
          <Link href="/parks">Zurück zur Übersicht</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/parks/${id}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {park.name} bearbeiten
          </h1>
          <p className="text-muted-foreground">
            Ändern Sie die Daten des Windparks
          </p>
        </div>
      </div>

      {/* Form */}
      <ParkForm initialData={park} />
    </div>
  );
}
