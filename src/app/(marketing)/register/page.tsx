"use client";

import { useState } from "react";
import Link from "next/link";
import { Wind, CheckCircle2, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FormData {
  name: string;
  company: string;
  email: string;
}

export default function RegisterPage() {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    company: "",
    email: "",
  });
  const [dsgvoAccepted, setDsgvoAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Anfrage konnte nicht gesendet werden.");
      setSubmitted(true);
    } catch {
      setError("Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4 py-16 pt-24">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--m-primary))]">
            <Wind className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white">WindparkManager</span>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 backdrop-blur-sm p-8 shadow-2xl">
          {submitted ? (
            /* Success State */
            <div className="text-center py-4">
              <div className="flex justify-center mb-4">
                <div className="rounded-full bg-green-500/15 p-4">
                  <CheckCircle2 className="h-8 w-8 text-green-400" />
                </div>
              </div>
              <h1 className="text-2xl font-bold text-white mb-3">
                Vielen Dank!
              </h1>
              <p className="text-slate-400 mb-6">
                Wir haben Ihre Anfrage erhalten und melden uns in Kuerze bei
                Ihnen.
              </p>
              <Button asChild variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800">
                <Link href="/">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Zurueck zur Startseite
                </Link>
              </Button>
            </div>
          ) : (
            /* Form */
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-white">
                  Demo anfordern
                </h1>
                <p className="text-slate-400 mt-1 text-sm">
                  Wir zeigen Ihnen WindparkManager in einer persoenlichen Demo.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-slate-300">
                      Name *
                    </Label>
                    <Input
                      id="name"
                      name="name"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Max Mustermann"
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-[hsl(var(--m-primary))]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="company" className="text-slate-300">
                      Unternehmen *
                    </Label>
                    <Input
                      id="company"
                      name="company"
                      required
                      value={formData.company}
                      onChange={handleChange}
                      placeholder="Windpark GmbH"
                      className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-[hsl(var(--m-primary))]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-slate-300">
                    E-Mail *
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="max@windpark.de"
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-[hsl(var(--m-primary))]"
                  />
                </div>

                {/* DSGVO checkbox */}
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="dsgvo"
                    required
                    checked={dsgvoAccepted}
                    onChange={(e) => setDsgvoAccepted(e.target.checked)}
                    className="mt-1 rounded border-slate-600 bg-slate-800 accent-[hsl(var(--m-primary))]"
                  />
                  <label htmlFor="dsgvo" className="text-xs text-slate-400 leading-relaxed">
                    Ich stimme der{" "}
                    <Link href="/datenschutz" className="underline hover:text-white transition-colors">
                      Datenschutzerklärung
                    </Link>{" "}
                    zu und bin mit der Verarbeitung meiner Daten zur Kontaktaufnahme einverstanden. *
                  </label>
                </div>

                {error && (
                  <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[hsl(var(--m-primary))] hover:brightness-110 text-white font-semibold py-2.5"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Wird gesendet...
                    </>
                  ) : (
                    "Demo anfordern"
                  )}
                </Button>
              </form>

              <p className="mt-4 text-center text-xs text-slate-500">
                Bereits Kunde?{" "}
                <Link
                  href="/login"
                  className="text-slate-400 hover:text-white underline underline-offset-4 transition-colors"
                >
                  Anmelden
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
