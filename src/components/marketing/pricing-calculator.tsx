"use client";

import { useState, useId } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import type { PricingConfig } from "@/lib/marketing/types";

// Default values used when no config is provided from the database
const DEFAULT_BASE_PRICE = 50;
const DEFAULT_TURBINE_PRICE = 10;
const DEFAULT_USER_PRICE = 5;
const DEFAULT_ANNUAL_DISCOUNT_PERCENT = 10;
const DEFAULT_MAX_TURBINES = 100;
const DEFAULT_MAX_USERS = 50;

interface PriceCalculatorProps {
  pricingConfig?: PricingConfig;
}

export function PriceCalculator({ pricingConfig }: PriceCalculatorProps) {
  const BASE_PRICE = pricingConfig?.basePrice ?? DEFAULT_BASE_PRICE;
  const TURBINE_PRICE = pricingConfig?.turbinePrice ?? DEFAULT_TURBINE_PRICE;
  const USER_PRICE = pricingConfig?.userPrice ?? DEFAULT_USER_PRICE;
  const ANNUAL_DISCOUNT_PERCENT = pricingConfig?.annualDiscountPercent ?? DEFAULT_ANNUAL_DISCOUNT_PERCENT;
  const MAX_TURBINES = pricingConfig?.maxTurbines ?? DEFAULT_MAX_TURBINES;
  const MAX_USERS = pricingConfig?.maxUsers ?? DEFAULT_MAX_USERS;
  const ANNUAL_DISCOUNT = (100 - ANNUAL_DISCOUNT_PERCENT) / 100;

  const [turbines, setTurbines] = useState(10);
  const [users, setUsers] = useState(3);
  const [isAnnual, setIsAnnual] = useState(false);
  const priceId = useId();

  const monthlyBase =
    BASE_PRICE + turbines * TURBINE_PRICE + users * USER_PRICE;
  const monthlyCost = isAnnual ? monthlyBase * ANNUAL_DISCOUNT : monthlyBase;

  return (
    <Card className="w-full max-w-lg mx-auto shadow-xl border-border/50 rounded-2xl">
      <CardHeader>
        <CardTitle className="text-xl">Preis-Rechner</CardTitle>
        <CardDescription>
          Berechnen Sie Ihre individuellen monatlichen Kosten.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {/* Turbine Slider */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="turbines">Anzahl Windkraftanlagen</Label>
            <output
              htmlFor="turbines"
              className="w-12 rounded-md border text-center px-2 py-0.5 text-sm text-foreground"
            >
              {turbines}
            </output>
          </div>
          <input
            id="turbines"
            type="range"
            min={1}
            max={MAX_TURBINES}
            step={1}
            value={turbines}
            onChange={(e) => setTurbines(parseInt(e.target.value, 10))}
            className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
            aria-describedby={`${priceId}-turbines`}
          />
          <p
            id={`${priceId}-turbines`}
            className="text-xs text-muted-foreground text-right"
          >
            {(turbines * TURBINE_PRICE).toFixed(2)} € / Monat
          </p>
        </div>

        {/* User Slider */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="users">Anzahl Benutzer</Label>
            <output
              htmlFor="users"
              className="w-12 rounded-md border text-center px-2 py-0.5 text-sm text-foreground"
            >
              {users}
            </output>
          </div>
          <input
            id="users"
            type="range"
            min={1}
            max={MAX_USERS}
            step={1}
            value={users}
            onChange={(e) => setUsers(parseInt(e.target.value, 10))}
            className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
            aria-describedby={`${priceId}-users`}
          />
          <p
            id={`${priceId}-users`}
            className="text-xs text-muted-foreground text-right"
          >
            {(users * USER_PRICE).toFixed(2)} € / Monat
          </p>
        </div>

        <div className="flex items-center space-x-2 pt-4">
          <Switch
            id="annual"
            checked={isAnnual}
            onCheckedChange={setIsAnnual}
          />
          <Label htmlFor="annual">Jährliche Zahlung (-{ANNUAL_DISCOUNT_PERCENT}%)</Label>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-4 bg-muted/50 p-6 rounded-b-2xl">
        <div
          className="flex w-full items-center justify-between"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="text-muted-foreground">Geschaetzter Preis</span>
          <div className="text-right">
            <span className="text-4xl font-bold gradient-text">
              {monthlyCost.toFixed(2)} €
            </span>
            <span className="text-sm font-medium text-muted-foreground">
              {" "}
              / Monat
            </span>
          </div>
        </div>
        <Link
          href="/register"
          className="w-full inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-3 text-base font-semibold text-white hover:brightness-110 transition-all"
        >
          Jetzt Angebot anfordern
        </Link>
      </CardFooter>
    </Card>
  );
}
