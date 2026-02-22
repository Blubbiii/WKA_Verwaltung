"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PersonalData } from "../onboarding-types";

interface StepPersonalDataProps {
  data: PersonalData;
  onChange: (data: PersonalData) => void;
  errors: Partial<Record<keyof PersonalData, string>>;
}

export function StepPersonalData({ data, onChange, errors }: StepPersonalDataProps) {
  function update(field: keyof PersonalData, value: string) {
    onChange({ ...data, [field]: value });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Stammdaten</h3>
        <p className="text-sm text-muted-foreground">
          Geben Sie die persoenlichen Daten des neuen Gesellschafters ein.
        </p>
      </div>

      {/* Name section */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="onb-salutation">Anrede</Label>
          <Select
            value={data.salutation}
            onValueChange={(value) => update("salutation", value)}
          >
            <SelectTrigger id="onb-salutation">
              <SelectValue placeholder="Bitte waehlen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Herr">Herr</SelectItem>
              <SelectItem value="Frau">Frau</SelectItem>
              <SelectItem value="Divers">Divers</SelectItem>
              <SelectItem value="Firma">Firma</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="onb-firstName">
            Vorname <span className="text-destructive">*</span>
          </Label>
          <Input
            id="onb-firstName"
            value={data.firstName}
            onChange={(e) => update("firstName", e.target.value)}
            placeholder="Max"
            aria-invalid={!!errors.firstName}
            aria-describedby={errors.firstName ? "onb-firstName-error" : undefined}
          />
          {errors.firstName && (
            <p id="onb-firstName-error" className="text-sm text-destructive">
              {errors.firstName}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="onb-lastName">
            Nachname <span className="text-destructive">*</span>
          </Label>
          <Input
            id="onb-lastName"
            value={data.lastName}
            onChange={(e) => update("lastName", e.target.value)}
            placeholder="Mustermann"
            aria-invalid={!!errors.lastName}
            aria-describedby={errors.lastName ? "onb-lastName-error" : undefined}
          />
          {errors.lastName && (
            <p id="onb-lastName-error" className="text-sm text-destructive">
              {errors.lastName}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="onb-birthDate">Geburtsdatum</Label>
          <Input
            id="onb-birthDate"
            type="date"
            value={data.birthDate}
            onChange={(e) => update("birthDate", e.target.value)}
          />
        </div>
      </div>

      {/* Address section */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-muted-foreground">Adresse</h4>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 sm:col-span-8 space-y-2">
            <Label htmlFor="onb-street">Strasse</Label>
            <Input
              id="onb-street"
              value={data.street}
              onChange={(e) => update("street", e.target.value)}
              placeholder="Musterstrasse"
            />
          </div>

          <div className="col-span-12 sm:col-span-4 space-y-2">
            <Label htmlFor="onb-houseNumber">Hausnummer</Label>
            <Input
              id="onb-houseNumber"
              value={data.houseNumber}
              onChange={(e) => update("houseNumber", e.target.value)}
              placeholder="1a"
            />
          </div>

          <div className="col-span-12 sm:col-span-4 space-y-2">
            <Label htmlFor="onb-postalCode">PLZ</Label>
            <Input
              id="onb-postalCode"
              value={data.postalCode}
              onChange={(e) => update("postalCode", e.target.value)}
              placeholder="12345"
              maxLength={5}
            />
          </div>

          <div className="col-span-12 sm:col-span-8 space-y-2">
            <Label htmlFor="onb-city">Ort</Label>
            <Input
              id="onb-city"
              value={data.city}
              onChange={(e) => update("city", e.target.value)}
              placeholder="Musterstadt"
            />
          </div>
        </div>
      </div>

      {/* Contact section */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-muted-foreground">Kontakt</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="onb-phone">Telefon</Label>
            <Input
              id="onb-phone"
              type="tel"
              value={data.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="+49 123 456789"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="onb-email">
              E-Mail <span className="text-destructive">*</span>
            </Label>
            <Input
              id="onb-email"
              type="email"
              value={data.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="max@example.de"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "onb-email-error" : undefined}
            />
            {errors.email && (
              <p id="onb-email-error" className="text-sm text-destructive">
                {errors.email}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tax section */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-muted-foreground">Steuer</h4>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="onb-taxId">Steuer-ID (optional)</Label>
            <Input
              id="onb-taxId"
              value={data.taxId}
              onChange={(e) => update("taxId", e.target.value)}
              placeholder="z.B. 12 345 678 901"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
