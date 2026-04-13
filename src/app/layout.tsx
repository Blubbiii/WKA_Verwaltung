import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { CookieBanner } from "@/components/cookie-banner";
import { SessionProvider } from "@/components/providers/session-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { UiStyleProvider } from "@/components/providers/ui-style-provider";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

// Inline script to apply UI style class BEFORE React hydrates.
// Mirrors what next-themes does for light/dark — prevents flash of unstyled content.
const uiStyleInitScript = `(function(){try{var s=localStorage.getItem('ui-style');if(s!=='glass'&&s!=='classic')s='classic';document.documentElement.classList.add('ui-'+s);}catch(e){document.documentElement.classList.add('ui-classic');}})();`;

// Self-hosted via next/font — downloaded at build time, no runtime Google request (DSGVO-konform)
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "WindparkManager",
  description: "Verwaltungs- und Abrechnungsplattform für Windkraftanlagen",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: uiStyleInitScript }} />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider>
          <UiStyleProvider>
            <NextIntlClientProvider messages={messages}>
              <QueryProvider>
                <SessionProvider>
                  {children}
                  <Toaster />
                  <CookieBanner />
                </SessionProvider>
              </QueryProvider>
            </NextIntlClientProvider>
          </UiStyleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
