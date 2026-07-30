/**
 * Bedienaufwand Tier 3 (Audit 2026-07): Navigation und Übersicht.
 *
 * Die drei Punkte dieses Tiers eint, dass die Bausteine schon im Repo lagen und
 * nur nicht angewandt wurden: `usePersistedTableState` auf 3 von ~15 Listen,
 * `?tab=`-Synchronisierung auf den Hubs aber nicht den Detailseiten, und
 * gespeicherte Filter auf genau einer Seite. Solche Ungleichverteilungen
 * wachsen leicht wieder zurück — deshalb diese Tests.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf-8");
}

function src(relativePath: string): string {
  return read(join("src", relativePath));
}

function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// #13 · Zahlungen am Pachtvertrag
// ---------------------------------------------------------------------------

describe("Pachtvertrag zeigt seine Zahlungen (#13)", () => {
  it("die API filtert auf einen Vertrag", () => {
    const route = src("app/api/leases/payments/route.ts");
    expect(route).toContain('searchParams.get("leaseId")');
    expect(route).toContain("...(leaseId ? { id: leaseId } : {})");
  });

  it("bei Einzelabfrage entfaellt die Statusbeschraenkung", () => {
    // Die Uebersicht zeigt nur laufende Vertraege. Von der Detailseite eines
    // beendeten Vertrags aus kaeme sonst eine leere Liste ohne Erklaerung.
    const route = src("app/api/leases/payments/route.ts");
    expect(route).toContain('...(leaseId ? {} : { status: { in: ["ACTIVE", "EXPIRING"] } })');
  });

  it("die Detailseite bindet die Karte ein", () => {
    const page = src("app/(dashboard)/leases/[id]/page.tsx");
    expect(page).toContain("<LeasePaymentsCard leaseId={lease.id} />");
  });

  it("die Karte leitet nichts selbst her", () => {
    // Zahlungen sind keine Tabelle, sondern aus Pachtzins, Rhythmus und
    // Rechnungen abgeleitet. Eine zweite Herleitung wuerde davon abdriften.
    const card = src("components/leases/lease-payments-card.tsx");
    expect(card).toContain("/api/leases/payments?leaseId=");
  });

  it("die Karte zeigt keine fremden Zahlungen", () => {
    const card = src("components/leases/lease-payments-card.tsx");
    expect(card).toContain("filter((p) => p.leaseId === leaseId)");
  });

  it("die Karte nutzt react-query, nicht useEffect+fetch", () => {
    const card = src("components/leases/lease-payments-card.tsx");
    expect(card).toContain("useQuery");
    expect(codeOnly(card)).not.toContain("useEffect");
  });

  it("die Zahlungsliste macht sichtbar, dass sie gefiltert ist", () => {
    // Sonst ist eine leere Tabelle nicht von "keine Zahlungen" zu unterscheiden.
    const page = src("app/(dashboard)/leases/payments/page.tsx");
    expect(page).toContain('searchParams.get("leaseId")');
    expect(page).toContain('t("leaseFilter.active"');
    expect(page).toContain('t("leaseFilter.clear")');
  });
});

// ---------------------------------------------------------------------------
// #15 · Tabs in der URL
// ---------------------------------------------------------------------------

describe("Aktiver Tab steht in der URL (#15)", () => {
  const hook = src("hooks/useTabParam.ts");

  it("unbekannte Werte fallen auf den Standard zurueck", () => {
    // Radix rendert bei einem value ohne passenden Trigger nichts — ein alter
    // Link oder Tippfehler haette also eine leere Seite ergeben.
    expect(hook).toContain("allowed.includes(raw)");
  });

  it("andere Query-Parameter bleiben erhalten", () => {
    // Das Hub-Muster (`router.replace(\`/admin/billing?tab=…\`)`) verwirft sie
    // und verdrahtet den Pfad fest.
    expect(hook).toContain("new URLSearchParams(searchParams.toString())");
    expect(hook).toContain("usePathname()");
  });

  it("der Standardwert landet nicht in der URL", () => {
    expect(hook).toContain("next.delete(paramName)");
  });

  it("ein Tabwechsel legt keine Historien-Station an", () => {
    expect(hook).toContain("router.replace(");
    expect(codeOnly(hook)).not.toContain("router.push(");
  });

  const ROLLED_OUT = [
    "app/(dashboard)/crm/contacts/[id]/page.tsx",
    "app/(dashboard)/votes/[id]/page.tsx",
    "app/(dashboard)/leases/usage-fees/[id]/page.tsx",
    "app/(dashboard)/admin/billing-rules/[id]/page.tsx",
    "app/(dashboard)/parks/[id]/weather/page.tsx",
    "app/(dashboard)/approvals/history/page.tsx",
    "app/(dashboard)/kommunikation/email/page.tsx",
    "app/(dashboard)/settings/page.tsx",
    "app/(dashboard)/admin/settings/page.tsx",
    "app/(dashboard)/admin/tenants/page.tsx",
    "app/(dashboard)/energy/scada/page.tsx",
  ];

  for (const path of ROLLED_OUT) {
    it(`${path.split("/").slice(-2).join("/")} nutzt den Hook`, () => {
      const page = src(path);
      expect(page).toContain("useTabParam(");
      expect(page).toContain("value={activeTab} onValueChange={setActiveTab}");
    });
  }

  const NESTED = [
    "app/(dashboard)/admin/billing/tabs/sequences.tsx",
    "app/(dashboard)/admin/documents-admin/tabs/templates.tsx",
    "app/(dashboard)/admin/system-admin/tabs/backup.tsx",
    "app/(dashboard)/admin/system-admin/tabs/config.tsx",
    "app/(dashboard)/admin/system-admin/tabs/flags.tsx",
    "app/(dashboard)/admin/system-admin/tabs/health.tsx",
    "app/(dashboard)/buchhaltung/zahlungen/tabs/mahnwesen.tsx",
  ];

  for (const path of NESTED) {
    it(`${path.split("/").slice(-2).join("/")} nutzt einen eigenen Parameter`, () => {
      // Diese Tabs sitzen INNERHALB einer Hub-Seite, die selbst ?tab= belegt.
      // Derselbe Parametername wuerde beide gegenseitig umschalten.
      const page = src(path);
      expect(page).toContain('paramName: "subtab"');
    });
  }

  it("kein <Tabs defaultValue=…> mehr in den umgestellten Dateien", () => {
    for (const path of [...ROLLED_OUT, ...NESTED]) {
      expect(src(path), path).not.toContain("<Tabs defaultValue=");
    }
  });
});

// ---------------------------------------------------------------------------
// #15 · Filter überleben den Seitenwechsel
// ---------------------------------------------------------------------------

describe("Listenfilter sind persistent (#15)", () => {
  const LISTS = [
    "app/(dashboard)/contracts/page.tsx",
    "app/(dashboard)/parks/page.tsx",
    "app/(dashboard)/funds/page.tsx",
    "app/(dashboard)/service-events/page.tsx",
    "app/(dashboard)/vendors/page.tsx",
    "app/(dashboard)/crm/contacts/page.tsx",
  ];

  for (const path of LISTS) {
    it(`${path.split("/").slice(-2).join("/")} nutzt usePersistedTableState`, () => {
      const page = src(path);
      expect(page).toContain("usePersistedTableState(");
      // Der alte lokale State darf nicht danebenstehen — sonst laufen zwei
      // Quellen fuer denselben Filter nebeneinander her.
      expect(page).not.toContain('const [search, setSearch] = useState("");');
    });
  }
});

// ---------------------------------------------------------------------------
// #16 · Gespeicherte Filter
// ---------------------------------------------------------------------------

describe("Gespeicherte Filter (#16)", () => {
  const picker = src("components/ui/saved-filter-picker.tsx");

  it("der Standardstern wird tatsaechlich angewendet", () => {
    // Er liess sich setzen und speichern — angewendet hat ihn nichts.
    expect(picker).toContain("applyDefaultOnMount");
    expect(picker).toContain("filters.find((f) => f.isDefault)");
  });

  it("er greift genau einmal je Mount", () => {
    // Sonst setzt jede Aenderung der Filterliste die Auswahl zurueck.
    expect(picker).toContain("defaultApplied");
    expect(picker).toContain("defaultApplied.current = true");
  });

  it("die Rechnungsliste bietet gespeicherte Filter an", () => {
    const page = src("app/(dashboard)/invoices/page.tsx");
    expect(page).toContain('surface="invoices"');
  });

  it("dort greift der Standardfilter NICHT automatisch", () => {
    // Die Liste stellt ueber usePersistedTableState den zuletzt benutzten
    // Filter wieder her; ein Standardfilter wuerde genau den ueberschreiben.
    const page = src("app/(dashboard)/invoices/page.tsx");
    const block = page.slice(page.indexOf('surface="invoices"'), page.indexOf('surface="invoices"') + 400);
    expect(codeOnly(block)).not.toContain("applyDefaultOnMount");
  });

  it("auf der Audit-Log-Seite greift er", () => {
    const page = src("app/(dashboard)/admin/audit-logs/page.tsx");
    expect(page).toContain("applyDefaultOnMount");
  });

  it("eine fremde Nutzlast bringt die Rechnungsliste nicht durcheinander", () => {
    const page = src("app/(dashboard)/invoices/page.tsx");
    expect(page).toContain('const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);');
  });
});

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------

describe("Uebersetzungen der Welle", () => {
  const locales = ["de", "en", "de-personal"] as const;

  function get(obj: Record<string, unknown>, path: string): unknown {
    return path.split(".").reduce<unknown>(
      (acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
      obj,
    );
  }

  const required = [
    "leases.payments.leaseFilter.active",
    "leases.payments.leaseFilter.activeUnknown",
    "leases.payments.leaseFilter.openLease",
    "leases.payments.leaseFilter.clear",
    "leases.detail.payments.title",
    "leases.detail.payments.emptyYear",
    "leases.detail.payments.summaryOverdue",
    "leases.detail.payments.status.overdue",
    "leases.detail.payments.openAll",
  ];

  for (const locale of locales) {
    it(`${locale} hat alle neuen Schluessel`, () => {
      const messages = JSON.parse(read(join("src", "messages", `${locale}.json`)));
      for (const path of required) {
        expect(get(messages, path), `${path} fehlt in ${locale}`).toBeTypeOf("string");
      }
    });
  }
});
