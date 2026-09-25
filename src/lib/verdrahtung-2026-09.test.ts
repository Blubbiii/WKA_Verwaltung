/**
 * Verdrahtungs-Audit 2026-09: Felder, die die Oberfläche sendet und die API
 * verwarf — und Aktionen, die an eine Route mit anderem Vertrag gingen.
 * Jeder Fall wurde gegen den laufenden Server nachgestellt.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const lies = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

describe("F5 Versicherungsschaden: das Schadensdatum lässt sich ändern", () => {
  const route = lies("app/api/management-billing/insurance-claims/[id]/route.ts");
  it("das Update-Schema kennt incidentDate und schreibt es", () => {
    expect(route).toMatch(/incidentDate:\s*z\./);
    expect(route).toMatch(/incidentDate:\s*new Date\(/);
  });
});

describe("F6 BF-Vertrag: 'Gebühr ändern' schreibt die Historie", () => {
  it("der Dialog nutzt die Route für die Gebührenhistorie", () => {
    const seite = lies("app/(dashboard)/management-billing/stakeholders/[id]/page.tsx");
    expect(seite).not.toContain("addFeeHistory");
    expect(seite).toContain("/fee-history`");
  });
});

describe("F7 Mandanten-Assistent: neue Benutzer bekommen ihre Rolle", () => {
  it("nach dem Anlegen wird die Rolle über /roles vergeben", () => {
    const assistent = lies("components/admin/tenant-onboarding-wizard.tsx");
    expect(assistent).toMatch(/\/api\/admin\/users\/\$\{[^}]+\}\/roles/);
    // The wizard is run by superadmins, who get system roles only on request.
    expect(assistent).toContain('fetch("/api/admin/roles?includeSystem=true")');
  });
});

describe("F9 Abrechnungen-Liste: bezahlt markieren und Status", () => {
  const liste = lies("app/(dashboard)/invoices/page.tsx");
  it("die Sammelaktion nutzt /mark-paid statt PATCH status", () => {
    expect(liste).not.toMatch(/JSON\.stringify\(\{\s*status:\s*"PAID"\s*\}\)/);
    expect(liste).toMatch(/\/mark-paid`/);
  });
  it("die Status-Spalte ist eine Anzeige, kein Eingabefeld", () => {
    // PATCH /api/invoices/[id] kennt kein status und lehnt alles außer Entwürfen ab.
    expect(liste).not.toMatch(/body: JSON\.stringify\(\{ status: val \}\)/);
  });
});

describe("Block B: Routen, die eine Oberfläche bekommen haben, werden aufgerufen", () => {
  const quellen: string[] = [];
  const sammle = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const pfad = join(dir, name);
      if (statSync(pfad).isDirectory()) {
        if (name !== "api") sammle(pfad);
      } else if (pfad.endsWith(".tsx") || (pfad.endsWith(".ts") && !pfad.endsWith(".test.ts"))) {
        quellen.push(readFileSync(pfad, "utf8"));
      }
    }
  };
  sammle(join(process.cwd(), "src", "app"));
  sammle(join(process.cwd(), "src", "components"));
  sammle(join(process.cwd(), "src", "lib"));
  const alles = quellen.join("\n");

  it.each([
    ['"/api/aml-checks"', "Legitimationsprüfung erfassen"],
    ["/api/aml-checks?dueOnly=true", "GwG-Wiedervorlagen"],
    ["/assess`", "Entschädigung ermitteln"],
    ["/replace`", "Großkomponente tauschen"],
    ["/api/admin/audit-logs/export", "Audit-Log exportieren"],
    ['"/api/batch/documents"', "Dokumente archivieren"],
    ['"/api/batch/settlements"', "Abrechnungen freigeben/zurückweisen"],
    ['"/api/reports/annual/async"', "Jahresbericht im Hintergrund"],
    ["/download`", "fertigen Bericht laden"],
    ['"/api/admin/cache"', "Cache-Status"],
    ['"/api/integrations/paperless/sync/status"', "Paperless-Übersicht"],
  ])("%s (%s)", (aufruf) => {
    expect(alles).toContain(aufruf);
  });
});

describe("Ressourcen-Freigaben bleiben im eigenen Mandanten", () => {
  const route = lies("app/api/admin/resource-access/route.ts");
  it("die Liste filtert über den Benutzer auf den Mandanten des Admins", () => {
    // Before: a tenant admin listed the grants — with user e-mails — of every tenant.
    expect(route).toMatch(/where\.user\s*=\s*\{\s*tenantId:\s*check\.tenantId/);
  });
  it("Gewähren und Entziehen nur für Benutzer des eigenen Mandanten", () => {
    const treffer = route.match(/prisma\.user\.findFirst\(\{\s*where:\s*\{\s*id:\s*validatedData\.userId,\s*tenantId:\s*check\.tenantId/g) ?? [];
    expect(treffer.length).toBe(2);
    expect(route).not.toContain("prisma.user.findUnique");
  });
});
