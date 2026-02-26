"use client";

import { use, useEffect, useState, useCallback } from "react";
import {
  Wind,
  Loader2,
  AlertCircle,
  CheckCircle2,
  LogIn,
  LogOut,
  Clock,
  Building2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface TurbineInfo {
  id: string;
  designation: string;
  manufacturer: string | null;
  model: string | null;
  park: { name: string };
}

interface SessionInfo {
  id: string;
  technicianName: string;
  companyName: string;
  checkInAt: string;
}

type PageState = "loading" | "idle" | "checked-in" | "completed" | "error";

export default function TechnikerPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [state, setState] = useState<PageState>("loading");
  const [turbine, setTurbine] = useState<TurbineInfo | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState("");

  // Check-in form
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check-out form
  const [workDescription, setWorkDescription] = useState("");

  // Live timer
  const [elapsed, setElapsed] = useState("");

  const loadTurbine = useCallback(async () => {
    try {
      const res = await fetch(`/api/techniker/${token}`);
      if (!res.ok) {
        setState("error");
        setError(
          res.status === 404
            ? "Dieser QR-Code ist nicht gültig oder wurde deaktiviert."
            : "Ein Fehler ist aufgetreten."
        );
        return;
      }
      const data = await res.json();
      setTurbine(data.turbine);
      if (data.activeSession) {
        setSession(data.activeSession);
        setState("checked-in");
      } else {
        setState("idle");
      }
    } catch {
      setState("error");
      setError("Verbindungsfehler. Bitte prüfen Sie Ihre Internetverbindung.");
    }
  }, [token]);

  useEffect(() => {
    loadTurbine();
  }, [loadTurbine]);

  // Live timer for checked-in state
  useEffect(() => {
    if (state !== "checked-in" || !session) return;

    function updateElapsed() {
      const start = new Date(session!.checkInAt).getTime();
      const diff = Math.floor((Date.now() - start) / 1000);
      const hours = Math.floor(diff / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;
      setElapsed(
        `${hours.toString().padStart(2, "0")}:${minutes
          .toString()
          .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      );
    }

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [state, session]);

  async function handleCheckIn(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/techniker/${token}/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technicianName: name, companyName: company }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Fehler beim Einchecken");
        // If already checked in (409), use the existing session
        if (res.status === 409 && data.session) {
          setSession({ ...data.session, technicianName: name, companyName: company });
          setState("checked-in");
        }
        setIsSubmitting(false);
        return;
      }

      setSession(data.session);
      setState("checked-in");
    } catch {
      setError("Verbindungsfehler. Bitte versuchen Sie es erneut.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCheckOut(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setIsSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/techniker/${token}/check-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: session.id,
          workDescription,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Fehler beim Auschecken");
        setIsSubmitting(false);
        return;
      }

      setState("completed");
    } catch {
      setError("Verbindungsfehler. Bitte versuchen Sie es erneut.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleNewCheckIn() {
    setName("");
    setCompany("");
    setWorkDescription("");
    setSession(null);
    setError("");
    setState("idle");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        {/* Header — always visible */}
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-primary/10 p-3">
              <Wind className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Techniker Check-In</CardTitle>
          {turbine && (
            <CardDescription className="space-y-1">
              <div className="font-medium text-foreground">
                {turbine.designation}
              </div>
              <div>
                {turbine.park.name}
                {turbine.manufacturer && ` · ${turbine.manufacturer}`}
                {turbine.model && ` ${turbine.model}`}
              </div>
            </CardDescription>
          )}
        </CardHeader>

        {/* Loading */}
        {state === "loading" && (
          <CardContent className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        )}

        {/* Error */}
        {state === "error" && (
          <CardContent className="text-center py-8 space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        )}

        {/* Check-In Form */}
        {state === "idle" && (
          <form onSubmit={handleCheckIn}>
            <CardContent className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-md">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="name">
                  <User className="h-4 w-4 inline mr-1" />
                  Ihr Name
                </Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Max Mustermann"
                  required
                  minLength={2}
                  disabled={isSubmitting}
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">
                  <Building2 className="h-4 w-4 inline mr-1" />
                  Firma
                </Label>
                <Input
                  id="company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Windservice GmbH"
                  required
                  minLength={2}
                  disabled={isSubmitting}
                  autoComplete="organization"
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button
                type="submit"
                className="w-full text-base py-6"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <LogIn className="mr-2 h-5 w-5" />
                )}
                Einchecken
              </Button>
            </CardFooter>
          </form>
        )}

        {/* Checked-In — Timer + Check-Out */}
        {state === "checked-in" && session && (
          <form onSubmit={handleCheckOut}>
            <CardContent className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-md">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* Active session info */}
              <div className="rounded-lg border bg-green-50 dark:bg-green-900/20 p-4 text-center space-y-2">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400 mx-auto" />
                <p className="text-sm text-green-800 dark:text-green-300">
                  Eingecheckt als{" "}
                  <span className="font-medium">{session.technicianName}</span>
                  {" "}({session.companyName})
                </p>
                <div className="flex items-center justify-center gap-2 text-2xl font-mono font-bold text-green-700 dark:text-green-300">
                  <Clock className="h-6 w-6" />
                  {elapsed}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="work">Durchgeführte Arbeiten</Label>
                <Textarea
                  id="work"
                  value={workDescription}
                  onChange={(e) => setWorkDescription(e.target.value)}
                  placeholder="Beschreiben Sie kurz, welche Arbeiten durchgeführt wurden..."
                  required
                  minLength={5}
                  rows={4}
                  disabled={isSubmitting}
                  className="resize-none"
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button
                type="submit"
                variant="destructive"
                className="w-full text-base py-6"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <LogOut className="mr-2 h-5 w-5" />
                )}
                Auschecken
              </Button>
            </CardFooter>
          </form>
        )}

        {/* Completed */}
        {state === "completed" && (
          <>
            <CardContent className="text-center py-8 space-y-4">
              <CheckCircle2 className="h-16 w-16 text-green-600 dark:text-green-400 mx-auto" />
              <div>
                <p className="text-xl font-semibold">Vielen Dank!</p>
                <p className="text-muted-foreground mt-1">
                  Ihre Arbeitszeit wurde erfolgreich erfasst.
                </p>
              </div>
              {session && (
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>
                    <span className="font-medium">{session.technicianName}</span>{" "}
                    ({session.companyName})
                  </p>
                  <p>Dauer: {elapsed}</p>
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button
                onClick={handleNewCheckIn}
                variant="outline"
                className="w-full text-base py-6"
              >
                Neuen Check-In starten
              </Button>
            </CardFooter>
          </>
        )}
      </Card>

      <div className="fixed bottom-4 text-center text-sm text-muted-foreground">
        WindparkManager
      </div>
    </div>
  );
}
