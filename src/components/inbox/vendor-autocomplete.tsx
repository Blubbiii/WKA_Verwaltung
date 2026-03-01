"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, User, X, Search } from "lucide-react";

interface VendorResult {
  type: "vendor";
  id: string;
  name: string;
  iban: string | null;
  bic: string | null;
  email: string | null;
}

interface PersonResult {
  type: "person";
  id: string;
  name: string;
  iban: string | null;
  bic: string | null;
  email: string | null;
  existingVendorId: string | null;
}

type SearchResult = VendorResult | PersonResult;

interface VendorAutocompleteProps {
  value: string | null;
  vendorName: string | null;
  onChange: (vendorId: string | null, meta?: { name?: string; iban?: string; bic?: string }) => void;
  disabled?: boolean;
}

export function VendorAutocomplete({
  value,
  vendorName,
  onChange,
  disabled,
}: VendorAutocompleteProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/vendors/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        const combined: SearchResult[] = [
          ...data.vendors,
          ...data.persons.filter((p: PersonResult) => !p.existingVendorId),
        ];
        setResults(combined);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectResult = async (result: SearchResult) => {
    if (result.type === "vendor") {
      onChange(result.id, { name: result.name, iban: result.iban ?? undefined, bic: result.bic ?? undefined });
    } else {
      // Person without existing vendor — create vendor from person
      try {
        const res = await fetch("/api/vendors", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: result.name,
            personId: result.id,
            iban: result.iban,
            bic: result.bic,
            email: result.email,
          }),
        });
        if (res.ok) {
          const vendor = await res.json();
          onChange(vendor.id, { name: vendor.name, iban: vendor.iban, bic: vendor.bic });
        }
      } catch {
        // ignore
      }
    }
    setOpen(false);
    setQuery("");
    setResults([]);
  };

  const clear = () => {
    onChange(null);
    setQuery("");
  };

  if (value && vendorName) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-sm py-1 px-3">
          <Building2 className="h-3 w-3 mr-1" />
          {vendorName}
        </Badge>
        {!disabled && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={clear}>
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Lieferant suchen oder eingeben..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          disabled={disabled}
        />
      </div>

      {open && (query.length >= 2) && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
          {loading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Suche...</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Keine Ergebnisse — Rechnung ohne Lieferant speichern oder Lieferant anlegen
            </div>
          ) : (
            <ul className="max-h-60 overflow-auto py-1">
              {results.map((r) => (
                <li
                  key={`${r.type}-${r.id}`}
                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent"
                  onClick={() => selectResult(r)}
                >
                  {r.type === "vendor" ? (
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.type === "person" ? "Person → neuer Lieferant" : "Lieferant"}
                      {r.iban ? ` · ${r.iban}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
