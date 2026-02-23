"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Wind, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawCallbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  // Security: Only allow relative URLs to prevent open redirect attacks
  const callbackUrl = rawCallbackUrl.startsWith("/") && !rawCallbackUrl.startsWith("//")
    ? rawCallbackUrl
    : "/dashboard";
  const error = searchParams.get("error");

  const [isLoading, setIsLoading] = useState(false);
  const resetSuccess = searchParams.get("reset") === "success";

  // Security: Strip credentials from URL if they leaked as query params
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("password") || url.searchParams.has("email")) {
      url.searchParams.delete("password");
      url.searchParams.delete("email");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, []);
  const [loginError, setLoginError] = useState(
    error === "CredentialsSignin"
      ? "Ungueltige Anmeldedaten. Bitte ueberpruefen Sie E-Mail und Passwort."
      : ""
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setLoginError("");

    const formData = new FormData(event.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setLoginError("Ungültige Anmeldedaten. Bitte überprüfen Sie E-Mail und Passwort.");
        setIsLoading(false);
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } catch (err) {
      setLoginError("Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.");
      setIsLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center mb-4">
          <div className="rounded-full bg-primary/10 p-3">
            <Wind className="h-8 w-8 text-primary" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold">WindparkManager</CardTitle>
        <CardDescription>
          Melden Sie sich mit Ihren Zugangsdaten an
        </CardDescription>
      </CardHeader>
      <form method="post" action="" onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          {resetSuccess && (
            <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription className="text-green-800 dark:text-green-300">
                Ihr Passwort wurde erfolgreich zurueckgesetzt. Sie koennen sich jetzt anmelden.
              </AlertDescription>
            </Alert>
          )}
          {loginError && (
            <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-md">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {loginError}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">E-Mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="name@example.com"
              autoComplete="email"
              required
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Passwort</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={isLoading}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Anmelden
          </Button>
          <Link
            href="/forgot-password"
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            Passwort vergessen?
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}

function LoginFormFallback() {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center mb-4">
          <div className="rounded-full bg-primary/10 p-3">
            <Wind className="h-8 w-8 text-primary" />
          </div>
        </div>
        <CardTitle className="text-2xl font-bold">WindparkManager</CardTitle>
        <CardDescription>
          Melden Sie sich mit Ihren Zugangsdaten an
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">E-Mail</Label>
          <Input id="email" type="email" disabled />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Passwort</Label>
          <Input id="password" type="password" disabled />
        </div>
      </CardContent>
      <CardFooter className="flex flex-col space-y-4">
        <Button className="w-full" disabled>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Laden...
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm />
      </Suspense>
      <div className="fixed bottom-4 text-center text-sm text-muted-foreground">
        WindparkManager v0.1.0
      </div>
    </div>
  );
}
