"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Wind, Menu, X } from "lucide-react";

const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#showcase", label: "Produkt" },
  { href: "#workflow", label: "Workflow" },
  { href: "#pricing", label: "Preise" },
];

export function MarketingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 20);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? "bg-background/95 backdrop-blur-md border-b border-border/40 shadow-sm"
          : "bg-transparent"
      }`}
    >
      <div className="container mx-auto flex h-16 items-center px-4 md:px-6">
        {/* Logo */}
        <Link
          className="mr-8 flex items-center gap-2 font-bold text-lg"
          href="/"
        >
          <Wind
            className={`h-6 w-6 ${scrolled ? "text-primary" : "text-blue-400"}`}
            aria-hidden="true"
          />
          <span className={scrolled ? "text-foreground" : "text-white"}>
            WindparkManager
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`transition-colors ${
                scrolled
                  ? "text-foreground/60 hover:text-foreground/80"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2">
          <nav className="hidden md:flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className={
                scrolled ? "" : "text-slate-300 hover:text-white hover:bg-white/10"
              }
              asChild
            >
              <Link href="/login">Login</Link>
            </Button>
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:brightness-110 transition-all"
            >
              Demo anfordern
            </Link>
          </nav>

          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="sm"
            className={`md:hidden ${scrolled ? "" : "text-white hover:bg-white/10"}`}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? "Menue schliessen" : "Menue oeffnen"}
          >
            {mobileOpen ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <nav
          id="mobile-nav"
          className="md:hidden border-t bg-background px-4 py-4 space-y-3 shadow-lg"
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block text-sm font-medium text-foreground/80 hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="flex gap-2 pt-2 border-t">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Login</Link>
            </Button>
            <Link
              href="/register"
              className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white"
            >
              Demo anfordern
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
