/**
 * Eleven test tenants for development and manual testing (2026-09).
 *
 *   npm run seed:test
 *
 * - Dev database only: refuses anything that is not localhost.
 * - Repeatable: deletes and rebuilds only tenants whose slug starts with
 *   "test-" (and their users "…@<slug>.test"); nothing else is touched.
 * - Deterministic: a fixed random seed — every run creates the same names
 *   and figures, so a finding can be reproduced.
 * - Fictitious: invented people and companies, IBANs with a valid format.
 *
 * Needs the base seed first (system roles, permissions): npm run seed
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

// ---------------------------------------------------------------------------
// Guard: never against a production database
// ---------------------------------------------------------------------------

const url = process.env.DATABASE_URL ?? "";
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();
if (!["localhost", "127.0.0.1", "::1"].includes(host) || process.env.NODE_ENV === "production") {
  console.error(`Abbruch: seed:test läuft nur gegen eine lokale Dev-Datenbank (Host: "${host || "?"}").`);
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const PASSWORT = "Test1234!";
// Relative to the run date: support grants, grace periods and the last 24
// months stay current however late the script runs.
const HEUTE = (() => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12));
})();

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

let zustand = 20260930;
function zufall(): number {
  // mulberry32
  zustand = (zustand + 0x6d2b79f5) | 0;
  let t = zustand;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ganz = (min: number, max: number) => min + Math.floor(zufall() * (max - min + 1));
const wahl = <T,>(liste: readonly T[]): T => liste[Math.floor(zufall() * liste.length)];
const runde = (x: number, stellen = 2) => Math.round(x * 10 ** stellen) / 10 ** stellen;
const tage = (n: number) => new Date(HEUTE.getTime() + n * 86_400_000);
const JAHR = HEUTE.getUTCFullYear();

const VORNAMEN = ["Anna", "Bernd", "Claudia", "Dieter", "Elke", "Frank", "Gisela", "Hauke", "Inge", "Jens", "Karin", "Lars", "Maren", "Nils", "Ortrud", "Peter", "Renate", "Sönke", "Tanja", "Uwe", "Vera", "Wiebke", "Heiko", "Silke", "Thomas", "Birte", "Kai", "Meike", "Ole", "Frauke"];
const NACHNAMEN = ["Hansen", "Petersen", "Jensen", "Carstens", "Thomsen", "Meyer", "Schulz", "Lorenzen", "Brodersen", "Asmussen", "Hinrichs", "Janssen", "Ahrens", "Wübbena", "Cordes", "Gerdes", "Harms", "Eilers", "Onken", "Tjaden", "Frerichs", "Behrens", "Rademacher", "Vogt", "Kruse"];
const ORTE = [
  { plz: "25813", ort: "Husum", kreis: "Nordfriesland", gemarkung: "Schobüll" },
  { plz: "25899", ort: "Niebüll", kreis: "Nordfriesland", gemarkung: "Deezbüll" },
  { plz: "26409", ort: "Wittmund", kreis: "Wittmund", gemarkung: "Burhafe" },
  { plz: "26603", ort: "Aurich", kreis: "Aurich", gemarkung: "Middels" },
  { plz: "27612", ort: "Loxstedt", kreis: "Cuxhaven", gemarkung: "Stotel" },
  { plz: "31582", ort: "Nienburg", kreis: "Nienburg", gemarkung: "Holtorf" },
  { plz: "49661", ort: "Cloppenburg", kreis: "Cloppenburg", gemarkung: "Stapelfeld" },
  { plz: "17489", ort: "Greifswald", kreis: "Vorpommern-Greifswald", gemarkung: "Wackerow" },
];
const STRASSEN = ["Dorfstraße", "Deichweg", "Am Mühlenberg", "Marschweg", "Hauptstraße", "Kirchweg", "Achter de Möhl", "Windparkweg", "Geestweg", "Koogstraße"];

function iban(): string {
  // DE + 2 check digits + 18 digits; checksum computed so the format validates.
  const bban = Array.from({ length: 18 }, () => ganz(0, 9)).join("");
  const numerisch = bban + "131400"; // "DE00" → D=13, E=14, 00
  let rest = 0;
  for (const z of numerisch) rest = (rest * 10 + Number(z)) % 97;
  return `DE${String(98 - rest).padStart(2, "0")}${bban}`;
}

// ---------------------------------------------------------------------------
// Context of one tenant
// ---------------------------------------------------------------------------

interface Ctx {
  tenantId: string;
  slug: string;
  adminId: string;
  kategorien: Record<string, string>;
  erloesarten: Record<string, string>;
  nummern: Record<string, number>;
}

function nummer(ctx: Ctx, praefix: string): string {
  ctx.nummern[praefix] = (ctx.nummern[praefix] ?? 0) + 1;
  return `${praefix}-${String(ctx.nummern[praefix]).padStart(5, "0")}`;
}

let rollen: Record<string, string> = {};
let passwortHash = "";

async function grundlagen() {
  const namen = ["Administrator", "Manager", "Nur Lesen", "Portal-Benutzer"];
  const gefunden = await prisma.role.findMany({ where: { name: { in: namen }, isSystem: true, tenantId: null } });
  rollen = Object.fromEntries(gefunden.map((r) => [r.name, r.id]));
  for (const n of namen) {
    if (!rollen[n]) throw new Error(`System-Rolle "${n}" fehlt — zuerst "npm run seed" ausführen.`);
  }
  passwortHash = await bcrypt.hash(PASSWORT, 10);

  const tarife = [
    { key: "start", name: "Start", preisMonatEur: 149, maxFirmen: 3, maxUmspannwerke: 1, maxWea: 5, maxBenutzer: 3, maxSpeicherMb: 2048, sortierung: 1 },
    { key: "pro", name: "Professional", preisMonatEur: 449, maxFirmen: 15, maxUmspannwerke: 3, maxWea: 30, maxBenutzer: 15, maxSpeicherMb: 20480, sortierung: 2, hervorgehoben: true },
    { key: "enterprise", name: "Enterprise", preisMonatEur: null, preisHinweis: "auf Anfrage", maxFirmen: null, maxUmspannwerke: null, maxWea: null, maxBenutzer: null, maxSpeicherMb: null, sortierung: 3 },
  ];
  for (const t of tarife) {
    // Create only: tariffs are edited in the marketing board, a re-run must not overwrite them.
    await prisma.tarif.upsert({ where: { key: t.key }, update: {}, create: t });
  }
}

async function aufraeumen() {
  const alt = await prisma.tenant.findMany({ where: { slug: { startsWith: "test-" } }, select: { id: true, slug: true } });
  if (alt.length === 0) return;
  const ids = alt.map((t) => t.id);
  // Everything this script creates, leaves first — several relations have
  // no cascade (lease lessors → person, invoices → fund …).
  const t = { tenantId: { in: ids } };
  await prisma.parkStakeholder.deleteMany({ where: { OR: [{ stakeholderTenantId: { in: ids } }, { parkTenantId: { in: ids } }] } });
  await prisma.leaseLessor.deleteMany({ where: { lease: t } });
  await prisma.leasePlot.deleteMany({ where: { lease: t } });
  await prisma.lease.deleteMany({ where: t });
  await prisma.plot.deleteMany({ where: t });
  await prisma.energySettlementItem.deleteMany({ where: { energySettlement: t } });
  await prisma.energySettlement.deleteMany({ where: t });
  await prisma.invoiceItem.deleteMany({ where: { invoice: t } });
  await prisma.distributionItem.deleteMany({ where: { distribution: t } });
  await prisma.distribution.deleteMany({ where: t });
  await prisma.invoice.deleteMany({ where: t });
  await prisma.incomingInvoice.deleteMany({ where: t });
  await prisma.voteProxy.deleteMany({ where: { grantor: { fund: t } } });
  await prisma.vote.deleteMany({ where: t });
  await prisma.shareholderMeeting.deleteMany({ where: t });
  await prisma.shareholder.deleteMany({ where: { fund: t } });
  await prisma.operationalTask.deleteMany({ where: t });
  await prisma.defect.deleteMany({ where: t });
  await prisma.insuranceClaim.deleteMany({ where: t });
  await prisma.faultCase.deleteMany({ where: t });
  await prisma.majorComponent.deleteMany({ where: t });
  await prisma.dismantlingObligation.deleteMany({ where: t });
  await prisma.scadaMeasurement.deleteMany({ where: t });
  await prisma.turbineProduction.deleteMany({ where: t });
  await prisma.fundPark.deleteMany({ where: { fund: t } });
  await prisma.turbine.deleteMany({ where: { park: t } });
  await prisma.park.deleteMany({ where: t });
  await prisma.fund.deleteMany({ where: t });
  await prisma.person.deleteMany({ where: t });
  await prisma.supportZugriff.deleteMany({ where: t });
  await prisma.notification.deleteMany({ where: t });
  await prisma.auditLog.deleteMany({ where: t });
  await prisma.userRoleAssignment.deleteMany({ where: { user: { email: { endsWith: ".test" } } } });
  await prisma.userTenantMembership.deleteMany({ where: { OR: [t, { user: { email: { endsWith: ".test" } } }] } });
  await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: ".test" } } });
  console.log(`Aufgeräumt: ${alt.length} alte Testmandanten`);
}

async function mandant(o: {
  slug: string;
  name: string;
  tarif: string | null;
  ort: (typeof ORTE)[number];
  lizenzUeberschrittenSeit?: Date;
  status?: "ACTIVE" | "INACTIVE";
}): Promise<Ctx> {
  const tarif = o.tarif ? await prisma.tarif.findUnique({ where: { key: o.tarif } }) : null;
  const t = await prisma.tenant.create({
    data: {
      name: o.name,
      slug: `test-${o.slug}`,
      contactEmail: `info@${o.slug}.test`,
      contactPhone: `+49 ${ganz(4100, 4999)} ${ganz(100000, 999999)}`,
      address: `${wahl(STRASSEN)} ${ganz(1, 80)}, ${o.ort.plz} ${o.ort.ort}`,
      status: o.status ?? "ACTIVE",
      tarifId: tarif?.id,
      lizenzUeberschrittenSeit: o.lizenzUeberschrittenSeit,
    },
  });

  const kat = [
    { name: "WKA-Betreiber", code: "BETREIBER", color: "#3b82f6", sortOrder: 0 },
    { name: "Netzgesellschaft", code: "NETZGESELLSCHAFT", color: "#7c3aed", sortOrder: 1 },
    { name: "Umspannwerk", code: "UMSPANNWERK", color: "#f97316", sortOrder: 2 },
    { name: "Betriebsführung", code: "BETRIEBSFUEHRUNG", color: "#0ea5e9", sortOrder: 3 },
    { name: "Verwaltung", code: "VERWALTUNG", color: "#6b7280", sortOrder: 4 },
  ];
  const kategorien: Record<string, string> = {};
  for (const k of kat) {
    kategorien[k.code] = (await prisma.fundCategory.create({ data: { ...k, tenantId: t.id } })).id;
  }
  const erloesarten: Record<string, string> = {};
  for (const r of [
    { name: "EEG-Vergütung", code: "EEG" },
    { name: "Direktvermarktung", code: "DIRECT" },
  ]) {
    erloesarten[r.code] = (await prisma.energyRevenueType.create({ data: { ...r, tenantId: t.id } })).id;
  }

  const ctx: Ctx = { tenantId: t.id, slug: o.slug, adminId: "", kategorien, erloesarten, nummern: {} };
  ctx.adminId = await benutzer(ctx, "admin", "Administrator", wahl(VORNAMEN), wahl(NACHNAMEN));
  await benutzer(ctx, "manager", "Manager", wahl(VORNAMEN), wahl(NACHNAMEN));
  await benutzer(ctx, "viewer", "Nur Lesen", wahl(VORNAMEN), wahl(NACHNAMEN));
  return ctx;
}

async function benutzer(ctx: Ctx, kennung: string, rolle: string, vorname: string, nachname: string): Promise<string> {
  const u = await prisma.user.create({
    data: {
      email: `${kennung}@${ctx.slug}.test`,
      passwordHash: passwortHash,
      firstName: vorname,
      lastName: nachname,
      tenantId: ctx.tenantId,
      status: "ACTIVE",
    },
  });
  await prisma.userRoleAssignment.create({ data: { userId: u.id, roleId: rollen[rolle], tenantId: ctx.tenantId } });
  await prisma.userTenantMembership.create({ data: { userId: u.id, tenantId: ctx.tenantId, isPrimary: true } });
  return u.id;
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

async function gesellschaft(
  ctx: Ctx,
  o: { name: string; rechtsform: string; kategorie: string; ort: (typeof ORTE)[number]; verwaltung?: "AKTIV" | "BETEILIGUNG"; kapital?: number },
) {
  return prisma.fund.create({
    data: {
      tenantId: ctx.tenantId,
      name: o.name,
      legalForm: o.rechtsform,
      fundCategoryId: ctx.kategorien[o.kategorie],
      verwaltung: o.verwaltung ?? "AKTIV",
      totalCapital: o.kapital ?? null,
      registrationCourt: `Amtsgericht ${o.ort.ort}`,
      registrationNumber: `HR${o.rechtsform.includes("KG") ? "A" : "B"} ${ganz(1000, 9999)}`,
      foundingDate: new Date(Date.UTC(ganz(2004, 2020), ganz(0, 11), 1)),
      street: wahl(STRASSEN),
      houseNumber: String(ganz(1, 60)),
      postalCode: o.ort.plz,
      city: o.ort.ort,
      managingDirector: `${wahl(VORNAMEN)} ${wahl(NACHNAMEN)}`,
      bankDetails: { iban: iban(), bic: "GENODEF1HUM", bankName: "Testbank eG" },
    },
  });
}

type Wea = { id: string; designation: string; ratedPowerKw: number };

async function park(
  ctx: Ctx,
  o: { name: string; kurz: string; ort: (typeof ORTE)[number]; wea: number; typ?: string; kw?: number; inbetrieb: number; betreiberId?: string; umspannwerkId?: string },
): Promise<{ id: string; turbinen: Wea[] }> {
  const kw = o.kw ?? 4200;
  const p = await prisma.park.create({
    data: {
      tenantId: ctx.tenantId,
      name: o.name,
      shortName: o.kurz,
      city: o.ort.ort,
      postalCode: o.ort.plz,
      latitude: runde(53 + zufall() * 1.8, 5),
      longitude: runde(7.3 + zufall() * 2.2, 5),
      commissioningDate: new Date(Date.UTC(o.inbetrieb, ganz(0, 11), ganz(1, 28))),
      totalCapacityKw: o.wea * kw,
      operatorFundId: o.betreiberId,
      billingEntityFundId: o.umspannwerkId ?? o.betreiberId,
      minimumRentPerTurbine: 12000,
      weaSharePercentage: 10,
      poolSharePercentage: 90,
    },
  });
  const turbinen: Wea[] = [];
  for (let i = 1; i <= o.wea; i++) {
    const t = await prisma.turbine.create({
      data: {
        parkId: p.id,
        designation: `${o.kurz} WEA ${String(i).padStart(2, "0")}`,
        manufacturer: "Enercon",
        model: o.typ ?? "E-138 EP3",
        deviceType: "WEA",
        ratedPowerKw: kw,
        hubHeightM: 131,
        rotorDiameterM: 138,
        serialNumber: `${ganz(100000, 999999)}`,
        commissioningDate: new Date(Date.UTC(o.inbetrieb, ganz(0, 11), ganz(1, 28))),
        mastrNumber: `SEE9${ganz(10000000, 99999999)}`,
        latitude: runde(53 + zufall() * 1.8, 5),
        longitude: runde(7.3 + zufall() * 2.2, 5),
      },
    });
    turbinen.push({ id: t.id, designation: t.designation, ratedPowerKw: kw });
  }
  if (o.betreiberId) await prisma.fundPark.create({ data: { fundId: o.betreiberId, parkId: p.id } });
  return { id: p.id, turbinen };
}

async function person(ctx: Ctx, o: { firma?: string; ort?: (typeof ORTE)[number]; email?: boolean } = {}) {
  const ort = o.ort ?? wahl(ORTE);
  const vorname = wahl(VORNAMEN);
  const nachname = wahl(NACHNAMEN);
  return prisma.person.create({
    data: {
      tenantId: ctx.tenantId,
      personType: o.firma ? "legal" : "natural",
      salutation: o.firma ? null : wahl(["Herr", "Frau"]),
      firstName: o.firma ? null : vorname,
      lastName: o.firma ? null : nachname,
      companyName: o.firma ?? null,
      street: wahl(STRASSEN),
      houseNumber: String(ganz(1, 90)),
      postalCode: ort.plz,
      city: ort.ort,
      email: o.email === false ? null : `${(o.firma ?? `${vorname}.${nachname}`).toLowerCase().replace(/[^a-z0-9.]+/g, "-")}.${ganz(10, 99)}@example.test`,
      bankIban: iban(),
      bankName: "Testbank eG",
      preferredDeliveryMethod: wahl(["EMAIL", "EMAIL", "POST"] as const),
    },
  });
}

async function gesellschafter(ctx: Ctx, fundId: string, anzahl: number, kapital: number, kuerzel: string) {
  const anteile = Array.from({ length: anzahl }, () => 0.3 + zufall() * 3);
  const summe = anteile.reduce((a, b) => a + b, 0);
  const ergebnis: { id: string; personId: string; prozent: number }[] = [];
  for (let i = 0; i < anzahl; i++) {
    const p = await person(ctx);
    const prozent = runde((anteile[i] / summe) * 100, 4);
    const s = await prisma.shareholder.create({
      data: {
        fundId,
        personId: p.id,
        shareholderNumber: `${kuerzel}-${String(i + 1).padStart(4, "0")}`,
        entryDate: new Date(Date.UTC(ganz(2008, 2022), ganz(0, 11), 1)),
        capitalContribution: runde((kapital * prozent) / 100),
        liabilityAmount: runde((kapital * prozent) / 1000),
        ownershipPercentage: prozent,
        votingRightsPercentage: prozent,
        distributionPercentage: prozent,
      },
    });
    ergebnis.push({ id: s.id, personId: p.id, prozent });
  }
  return ergebnis;
}

async function pacht(ctx: Ctx, parkId: string, ort: (typeof ORTE)[number], flurstuecke: number, verpaechter: number, vertragspartnerFundId?: string) {
  const personen = [];
  for (let i = 0; i < verpaechter; i++) personen.push(await person(ctx, { ort }));
  const flur = ganz(1, 9);
  for (let i = 0; i < flurstuecke; i++) {
    const plot = await prisma.plot.create({
      data: {
        tenantId: ctx.tenantId,
        parkId,
        county: ort.kreis,
        municipality: ort.ort,
        cadastralDistrict: ort.gemarkung,
        fieldNumber: String(flur + Math.floor(i / 12)),
        plotNumber: `${ganz(10, 399)}/${i + 1}`,
        areaSqm: ganz(8000, 95000),
        usageType: wahl(["Acker", "Grünland", "Acker", "Wald"]),
      },
    });
    const lessor = personen[i % personen.length];
    const lease = await prisma.lease.create({
      data: {
        tenantId: ctx.tenantId,
        lessorId: lessor.id,
        contractPartnerFundId: vertragspartnerFundId,
        signedDate: new Date(Date.UTC(ganz(2010, 2018), ganz(0, 11), ganz(1, 28))),
        startDate: new Date(Date.UTC(2019, 0, 1)),
        endDate: new Date(Date.UTC(2044, 11, 31)),
        status: "ACTIVE",
        billingInterval: "ANNUAL",
        paymentDay: 15,
      },
    });
    await prisma.leasePlot.create({ data: { leaseId: lease.id, plotId: plot.id } });
    await prisma.leaseLessor.create({ data: { leaseId: lease.id, personId: lessor.id, sharePercent: 100 } });
  }
}

/** Monthly output per turbine; seasonal (more in winter), EEG or DV revenue. */
function monatsertragKwh(kw: number, monat: number): number {
  const saison = 1 + 0.35 * Math.cos(((monat - 1) / 12) * 2 * Math.PI);
  return runde(kw * 730 * 0.27 * saison * (0.85 + zufall() * 0.3), 0);
}

const MONATE: { jahr: number; monat: number }[] = [];
for (let i = 23; i >= 0; i--) {
  const d = new Date(Date.UTC(HEUTE.getUTCFullYear(), HEUTE.getUTCMonth() - i, 1)); // last 24 months incl. the current one
  MONATE.push({ jahr: d.getUTCFullYear(), monat: d.getUTCMonth() + 1 });
}

async function produktion(ctx: Ctx, turbinen: Wea[], monate = MONATE) {
  const zeilen: Prisma.TurbineProductionCreateManyInput[] = [];
  const jeMonat = new Map<string, number>();
  for (const t of turbinen) {
    for (const m of monate) {
      const kwh = monatsertragKwh(t.ratedPowerKw, m.monat);
      jeMonat.set(`${m.jahr}-${m.monat}`, (jeMonat.get(`${m.jahr}-${m.monat}`) ?? 0) + kwh);
      zeilen.push({
        tenantId: ctx.tenantId,
        turbineId: t.id,
        year: m.jahr,
        month: m.monat,
        productionKwh: kwh,
        operatingHours: runde(700 + zufall() * 30, 1),
        availabilityPct: runde(95 + zufall() * 4.8, 2),
        source: "MANUAL",
        status: "CONFIRMED",
      });
    }
  }
  await prisma.turbineProduction.createMany({ data: zeilen });
  return jeMonat;
}

/**
 * Grid operator's credit per park and month, distributed to the recipient
 * funds by production share (EnergySettlement + items).
 */
async function energieabrechnungen(
  ctx: Ctx,
  parkId: string,
  jeMonat: Map<string, number>,
  empfaenger: { fundId: string; anteil: number }[],
  preisCtKwh = 7.6,
) {
  for (const m of MONATE) {
    const kwh = jeMonat.get(`${m.jahr}-${m.monat}`) ?? 0;
    const erloes = runde((kwh * preisCtKwh) / 100);
    const aktuell = MONATE.indexOf(m) >= MONATE.length - 2;
    const es = await prisma.energySettlement.create({
      data: {
        tenantId: ctx.tenantId,
        parkId,
        year: m.jahr,
        month: m.monat,
        totalProductionKwh: kwh,
        netOperatorRevenueEur: erloes,
        netOperatorReference: `NB-${m.jahr}${String(m.monat).padStart(2, "0")}-${ganz(1000, 9999)}`,
        status: aktuell ? "CALCULATED" : "CLOSED",
      },
    });
    for (const e of empfaenger) {
      await prisma.energySettlementItem.create({
        data: {
          energySettlementId: es.id,
          recipientFundId: e.fundId,
          productionShareKwh: runde(kwh * e.anteil, 0),
          productionSharePct: runde(e.anteil * 100, 4),
          revenueShareEur: runde(erloes * e.anteil),
        },
      });
    }
  }
}

async function rechnung(
  ctx: Ctx,
  o: {
    typ: "INVOICE" | "CREDIT_NOTE";
    fundId?: string;
    empfaenger: string;
    empfaengerPersonId?: string;
    datum: Date;
    positionen: { text: string; netto: number; ust?: number }[];
    status?: "DRAFT" | "SENT" | "PAID" | "PARTIALLY_PAID" | "CANCELLED";
    mahnstufe?: number;
    parkId?: string;
  },
) {
  const ust = o.positionen[0]?.ust ?? (o.typ === "CREDIT_NOTE" ? 0 : 19);
  const netto = runde(o.positionen.reduce((s, p) => s + p.netto, 0));
  const steuer = runde((netto * ust) / 100);
  const status = o.status ?? "SENT";
  const inv = await prisma.invoice.create({
    data: {
      tenantId: ctx.tenantId,
      invoiceType: o.typ,
      invoiceNumber: nummer(ctx, o.typ === "INVOICE" ? "RE" : "GS"),
      invoiceDate: o.datum,
      dueDate: new Date(o.datum.getTime() + 14 * 86_400_000),
      fundId: o.fundId,
      parkId: o.parkId,
      recipientName: o.empfaenger,
      recipientPersonId: o.empfaengerPersonId,
      netAmount: netto,
      taxRate: ust,
      taxAmount: steuer,
      grossAmount: runde(netto + steuer),
      status,
      sentAt: status === "DRAFT" ? null : o.datum,
      paidAt: status === "PAID" ? new Date(o.datum.getTime() + 10 * 86_400_000) : null,
      paidAmount: status === "PAID" ? runde(netto + steuer) : status === "PARTIALLY_PAID" ? runde((netto + steuer) / 2) : 0,
      reminderLevel: o.mahnstufe ?? null,
      reminderSentAt: o.mahnstufe ? tage(-ganz(3, 20)) : null,
      createdById: ctx.adminId,
    },
  });
  let nr = 1;
  for (const p of o.positionen) {
    const s = runde((p.netto * ust) / 100);
    await prisma.invoiceItem.create({
      data: {
        invoiceId: inv.id,
        position: nr++,
        description: p.text,
        quantity: 1,
        unitPrice: p.netto,
        netAmount: p.netto,
        taxRate: ust,
        taxAmount: s,
        grossAmount: runde(p.netto + s),
      },
    });
  }
  return inv;
}

async function ausschuettung(ctx: Ctx, fundId: string, betrag: number, gesell: { id: string; personId: string; prozent: number }[], jahr: number, ausgezahlt: boolean) {
  const d = await prisma.distribution.create({
    data: {
      tenantId: ctx.tenantId,
      fundId,
      distributionNumber: `AS-${jahr}-001`,
      totalAmount: betrag,
      distributionDate: new Date(Date.UTC(jahr, 5, 30)),
      description: `Ausschüttung Geschäftsjahr ${jahr - 1}`,
      status: ausgezahlt ? "EXECUTED" : "DRAFT",
    },
  });
  await prisma.distributionItem.createMany({
    data: gesell.map((g) => ({
      distributionId: d.id,
      shareholderId: g.id,
      percentage: g.prozent,
      amount: runde((betrag * g.prozent) / 100),
    })),
  });
}


// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

/** Lease credit notes to the lessors of a park for one year. */
async function pachtGutschriften(ctx: Ctx, fundId: string, parkId: string, jahr: number, anzahl: number) {
  const leases = await prisma.lease.findMany({
    where: { tenantId: ctx.tenantId, leasePlots: { some: { plot: { parkId } } } },
    include: { lessor: true },
    take: anzahl,
  });
  for (const l of leases) {
    const name = l.lessor.companyName ?? `${l.lessor.firstName} ${l.lessor.lastName}`;
    await rechnung(ctx, {
      typ: "CREDIT_NOTE",
      fundId,
      parkId,
      empfaenger: name,
      empfaengerPersonId: l.lessorId,
      datum: new Date(Date.UTC(jahr + 1, 2, 15)),
      positionen: [{ text: `Pacht ${jahr} — Flächen- und Standortanteil`, netto: ganz(1800, 14000), ust: 0 }],
      status: zufall() < 0.9 ? "PAID" : "SENT",
    });
  }
}

/** A mix of outgoing invoices: paid, open, overdue with dunning levels, one draft. */
async function rechnungsMix(ctx: Ctx, fundId: string, empfaenger: string[]) {
  const texte = ["Kostenumlage Zuwegung", "Anteil Kranstellfläche Instandhaltung", "Weiterbelastung Netzentgelt", "Kostenbeteiligung Eiserkennung", "Anteil Schattenwurfmodul"];
  for (let i = 0; i < 14; i++) {
    const alter = ganz(5, 240);
    const status = alter > 60 ? (zufall() < 0.75 ? "PAID" : "SENT") : zufall() < 0.5 ? "SENT" : "PAID";
    const ueberfaellig = status === "SENT" && alter > 30;
    await rechnung(ctx, {
      typ: "INVOICE",
      fundId,
      empfaenger: wahl(empfaenger),
      datum: tage(-alter),
      positionen: [{ text: wahl(texte), netto: ganz(400, 18000) }],
      status,
      mahnstufe: ueberfaellig ? Math.min(3, Math.ceil(alter / 45)) : undefined,
    });
  }
  await rechnung(ctx, { typ: "INVOICE", fundId, empfaenger: wahl(empfaenger), datum: tage(-2), positionen: [{ text: "Kostenumlage Zuwegung (Entwurf)", netto: 2400 }], status: "DRAFT" });
}

async function s1Nordwind() {
  const ort = ORTE[0];
  const ctx = await mandant({ slug: "nordwind", name: "Nordwind Betriebs GmbH & Co. KG", tarif: "pro", ort });
  await gesellschaft(ctx, { name: "Nordwind Verwaltungs-GmbH", rechtsform: "GmbH", kategorie: "VERWALTUNG", ort });
  const kg = await gesellschaft(ctx, { name: "Nordwind Betriebs GmbH & Co. KG", rechtsform: "GmbH & Co. KG", kategorie: "BETREIBER", ort, kapital: 12_000_000 });
  const uw = await gesellschaft(ctx, { name: "Umspannwerk Nordwind GmbH & Co. KG", rechtsform: "GmbH & Co. KG", kategorie: "UMSPANNWERK", ort });
  const parks = [];
  const plan = [
    { nr: 1, wea: 8, flur: 24, verp: 16 },
    { nr: 2, wea: 6, flur: 18, verp: 12 },
    { nr: 3, wea: 4, flur: 18, verp: 12 },
  ];
  for (const x of plan) {
    const o = ORTE[x.nr - 1];
    const p = await park(ctx, { name: `Windpark Nordwind ${"I".repeat(x.nr)}`, kurz: `NW${x.nr}`, ort: o, wea: x.wea, inbetrieb: 2017 + x.nr, betreiberId: kg.id, umspannwerkId: uw.id });
    await pacht(ctx, p.id, o, x.flur, x.verp, kg.id);
    const jeMonat = await produktion(ctx, p.turbinen);
    await energieabrechnungen(ctx, p.id, jeMonat, [{ fundId: kg.id, anteil: 1 }]);
    await pachtGutschriften(ctx, kg.id, p.id, JAHR - 1, 10);
    parks.push(p);
  }
  const gesell = await gesellschafter(ctx, kg.id, 120, 12_000_000, "NW");
  await rechnungsMix(ctx, kg.id, ["Windpark Achterdeich GmbH", "Netzgesellschaft Marsch GbR", "Bürgerwind Koog eG"]);
  await ausschuettung(ctx, kg.id, 840_000, gesell, JAHR - 1, true);
  await ausschuettung(ctx, kg.id, 910_000, gesell, JAHR, false);
  // An active support grant — to test the platform support flow.
  await prisma.supportZugriff.create({ data: { tenantId: ctx.tenantId, art: "FREIGABE", erteiltVonId: ctx.adminId, gueltigBis: tage(7) } });
  return { ctx, parks };
}

async function s2Kleinwind() {
  const ort = ORTE[3];
  const ctx = await mandant({ slug: "kleinwind", name: "Bürgerwindpark Kleinwind GmbH & Co. KG", tarif: "start", ort });
  const kg = await gesellschaft(ctx, { name: "Bürgerwindpark Kleinwind GmbH & Co. KG", rechtsform: "GmbH & Co. KG", kategorie: "BETREIBER", ort, kapital: 4_800_000 });
  const p = await park(ctx, { name: "Bürgerwindpark Kleinwind", kurz: "KW", ort, wea: 3, kw: 3000, typ: "E-115 EP3", inbetrieb: 2016, betreiberId: kg.id });
  await pacht(ctx, p.id, ort, 9, 7, kg.id);
  const jeMonat = await produktion(ctx, p.turbinen);
  await energieabrechnungen(ctx, p.id, jeMonat, [{ fundId: kg.id, anteil: 1 }]);
  const gesell = await gesellschafter(ctx, kg.id, 400, 4_800_000, "BW");
  await ausschuettung(ctx, kg.id, 312_000, gesell, JAHR - 1, true);

  // Five investors with portal access.
  for (let i = 0; i < 5; i++) {
    const g = gesell[i];
    const pers = await prisma.person.findUniqueOrThrow({ where: { id: g.personId } });
    const u = await prisma.user.create({
      data: { email: `anleger${i + 1}@kleinwind.test`, passwordHash: passwortHash, firstName: pers.firstName, lastName: pers.lastName, tenantId: ctx.tenantId, status: "ACTIVE" },
    });
    await prisma.userRoleAssignment.create({ data: { userId: u.id, roleId: rollen["Portal-Benutzer"], tenantId: ctx.tenantId } });
    await prisma.userTenantMembership.create({ data: { userId: u.id, tenantId: ctx.tenantId, isPrimary: true } });
    await prisma.shareholder.update({ where: { id: g.id }, data: { userId: u.id } });
  }

  // Meetings, votes, proxies.
  await prisma.shareholderMeeting.create({
    data: { tenantId: ctx.tenantId, fundId: kg.id, meetingNumber: `GV-${JAHR}-01`, type: "ORDINARY", status: "HELD", scheduledAt: tage(-90), location: "Dorfgemeinschaftshaus Middels", chairperson: "Heiko Janssen", createdById: ctx.adminId },
  });
  await prisma.shareholderMeeting.create({
    data: { tenantId: ctx.tenantId, fundId: kg.id, meetingNumber: `GV-${JAHR}-02`, type: "EXTRAORDINARY", status: "INVITED", scheduledAt: tage(50), location: "Gasthof Zur Linde", invitationSentAt: tage(-10), createdById: ctx.adminId },
  });
  const optionen = ["Ja", "Nein", "Enthaltung"];
  await prisma.vote.create({
    data: { tenantId: ctx.tenantId, fundId: kg.id, title: `Feststellung Jahresabschluss ${JAHR - 1}`, voteType: "RESOLUTION", options: optionen, startDate: tage(-130), endDate: tage(-90), status: "CLOSED", quorumPercentage: 50, createdById: ctx.adminId },
  });
  const offen = await prisma.vote.create({
    data: { tenantId: ctx.tenantId, fundId: kg.id, title: "Repowering-Vorprüfung beauftragen", voteType: "RESOLUTION", options: optionen, startDate: tage(-5), endDate: tage(25), status: "ACTIVE", quorumPercentage: 50, requiresCapitalMajority: true, createdById: ctx.adminId },
  });
  for (let i = 10; i < 20; i++) {
    await prisma.voteProxy.create({ data: { grantorId: gesell[i].id, granteeId: gesell[i + 20].id, voteId: i % 2 ? offen.id : null, validFrom: tage(-30) } });
  }
}

async function s3BfService(kunden: { tenantId: string; parks: { id: string }[]; umsatz: number }[]) {
  const ort = ORTE[4];
  const ctx = await mandant({ slug: "bf-service", name: "BF-Service Nord GmbH", tarif: "pro", ort });
  await gesellschaft(ctx, { name: "BF-Service Nord GmbH", rechtsform: "GmbH", kategorie: "BETRIEBSFUEHRUNG", ort });
  for (const k of kunden) {
    for (const p of k.parks) {
      const sh = await prisma.parkStakeholder.create({
        data: { stakeholderTenantId: ctx.tenantId, parkTenantId: k.tenantId, parkId: p.id, role: "COMMERCIAL_BF", billingEnabled: true, feePercentage: 2.5, validFrom: new Date(Date.UTC(2024, 0, 1)) },
      });
      const bisMonat = HEUTE.getUTCMonth() + 1;
      for (let m = 1; m <= bisMonat; m++) {
        const basis = runde((k.umsatz / 12 / k.parks.length) * (0.8 + zufall() * 0.4));
        const netto = runde(basis * 0.025);
        await prisma.managementBilling.create({
          data: { stakeholderId: sh.id, year: JAHR, month: m, baseRevenueEur: basis, feePercentageUsed: 2.5, feeAmountNetEur: netto, taxRate: 19, taxAmountEur: runde(netto * 0.19), feeAmountGrossEur: runde(netto * 1.19), status: m <= bisMonat - 2 ? "INVOICED" : "CALCULATED" },
        });
      }
    }
  }
  const kundenParks = kunden.flatMap((k) => k.parks);
  const aufgaben = ["Quartalsbegehung", "Zählerablesung prüfen", "Versicherungsnachweis anfordern", "Pachtabrechnung vorbereiten", "Netzbetreiber-Gutschrift abgleichen", "Eiserkennung testen lassen"];
  for (let i = 0; i < 14; i++) {
    await prisma.operationalTask.create({
      data: { tenantId: ctx.tenantId, title: wahl(aufgaben), status: wahl(["OPEN", "IN_PROGRESS", "DONE"] as const), priority: ganz(1, 3), dueDate: tage(ganz(-20, 45)), parkId: wahl(kundenParks).id, createdById: ctx.adminId },
    });
  }
  for (let i = 0; i < 6; i++) {
    await prisma.defect.create({
      data: { tenantId: ctx.tenantId, title: wahl(["Korrosion Turmfuß", "Riss Fundamentabdeckung", "Zuwegung ausgespült", "Blitzschutz-Messprotokoll fehlt"]), severity: wahl(["LOW", "MEDIUM", "HIGH"] as const), status: wahl(["OPEN", "IN_PROGRESS", "DONE"] as const), parkId: wahl(kundenParks).id, createdById: ctx.adminId },
    });
  }
}

async function s4Hansen() {
  const ort = ORTE[1];
  const ctx = await mandant({ slug: "hansen", name: "Hansen Windkraft GmbH & Co. KG", tarif: "start", ort });
  const kg = await gesellschaft(ctx, { name: "Hansen Windkraft GmbH & Co. KG", rechtsform: "GmbH & Co. KG", kategorie: "BETREIBER", ort, kapital: 1_200_000 });
  await gesellschaft(ctx, { name: "Bürgerwind Deezbüll Beteiligungs-GmbH", rechtsform: "GmbH", kategorie: "BETREIBER", ort, verwaltung: "BETEILIGUNG" });
  await gesellschaft(ctx, { name: "Netzgesellschaft Niebüll GbR", rechtsform: "GbR", kategorie: "NETZGESELLSCHAFT", ort, verwaltung: "BETEILIGUNG" });
  const p = await park(ctx, { name: "Windpark Hansen-Koog", kurz: "HK", ort, wea: 2, kw: 2300, typ: "E-82 E2", inbetrieb: 2012, betreiberId: kg.id });
  await pacht(ctx, p.id, ort, 4, 3, kg.id);
  const jeMonat = await produktion(ctx, p.turbinen);
  await energieabrechnungen(ctx, p.id, jeMonat, [{ fundId: kg.id, anteil: 1 }], 8.9);
  const gesell = await gesellschafter(ctx, kg.id, 12, 1_200_000, "HK");
  await ausschuettung(ctx, kg.id, 96_000, gesell, JAHR - 1, true);
  return { ctx, parks: [p] };
}

/** Tenant above its licence: grace period running (< 30 days) or expired (> 30 days). */
async function sLizenz(slug: string, name: string, wea: number, gesellschaften: number, seitTagen: number) {
  const ort = ORTE[5];
  const kurz = name.split(" ")[0];
  const ctx = await mandant({ slug, name, tarif: "start", ort, lizenzUeberschrittenSeit: tage(-seitTagen) });
  const funds = [];
  for (let i = 0; i < gesellschaften; i++) {
    funds.push(await gesellschaft(ctx, { name: `${kurz} Windpark ${i + 1} GmbH & Co. KG`, rechtsform: "GmbH & Co. KG", kategorie: "BETREIBER", ort }));
  }
  const p = await park(ctx, { name: `Windpark ${kurz}`, kurz: slug.slice(0, 2).toUpperCase(), ort, wea, inbetrieb: 2020, betreiberId: funds[0].id });
  const jeMonat = await produktion(ctx, p.turbinen);
  await energieabrechnungen(ctx, p.id, jeMonat, [{ fundId: funds[0].id, anteil: 1 }]);
  await gesellschafter(ctx, funds[0].id, 25, 3_000_000, slug.slice(0, 2).toUpperCase());
}

async function sHolding() {
  const nord = await mandant({ slug: "holding-nord", name: "Weser-Holding — Einheit Nord", tarif: "pro", ort: ORTE[4] });
  const sued = await mandant({ slug: "holding-sued", name: "Weser-Holding — Einheit Süd", tarif: "pro", ort: ORTE[5] });
  const plan = [
    { ctx: nord, ort: ORTE[4], wea: 4, teil: "Nord", kurz: "HN" },
    { ctx: sued, ort: ORTE[5], wea: 3, teil: "Süd", kurz: "HS" },
  ];
  for (const x of plan) {
    const kg = await gesellschaft(x.ctx, { name: `${x.teil}wind Weser GmbH & Co. KG`, rechtsform: "GmbH & Co. KG", kategorie: "BETREIBER", ort: x.ort, kapital: 5_000_000 });
    const p = await park(x.ctx, { name: `Windpark Weser ${x.teil}`, kurz: x.kurz, ort: x.ort, wea: x.wea, inbetrieb: 2021, betreiberId: kg.id });
    await pacht(x.ctx, p.id, x.ort, 8, 6, kg.id);
    const jeMonat = await produktion(x.ctx, p.turbinen);
    await energieabrechnungen(x.ctx, p.id, jeMonat, [{ fundId: kg.id, anteil: 1 }]);
    await gesellschafter(x.ctx, kg.id, 30, 5_000_000, x.kurz);
  }
  // One manager for both separate units: home in Nord, membership in Süd.
  const u = await prisma.user.create({
    data: { email: "leitung@holding.test", passwordHash: passwortHash, firstName: "Gesa", lastName: "Wübbena", tenantId: nord.tenantId, status: "ACTIVE" },
  });
  // Roles per tenant: administrator in Nord, manager in Süd — so the test
  // data shows that rights follow the unit the user works in.
  const zuordnung = [
    { ctx: nord, rolle: "Administrator" },
    { ctx: sued, rolle: "Manager" },
  ];
  for (const z of zuordnung) {
    await prisma.userRoleAssignment.create({ data: { userId: u.id, roleId: rollen[z.rolle], tenantId: z.ctx.tenantId } });
    await prisma.userTenantMembership.create({ data: { userId: u.id, tenantId: z.ctx.tenantId, isPrimary: z.ctx === nord } });
  }
}

async function s9Altwind() {
  const ort = ORTE[2];
  const ctx = await mandant({ slug: "altwind", name: "Altwind Repowering GmbH & Co. KG", tarif: "pro", ort });
  const kg = await gesellschaft(ctx, { name: "Altwind Burhafe GmbH & Co. KG", rechtsform: "GmbH & Co. KG", kategorie: "BETREIBER", ort, kapital: 2_600_000 });
  const p = await park(ctx, { name: "Windpark Burhafe (Altbestand)", kurz: "BH", ort, wea: 6, kw: 1800, typ: "E-66 18.70", inbetrieb: 2004, betreiberId: kg.id });
  await pacht(ctx, p.id, ort, 10, 8, kg.id);
  const jeMonat = await produktion(ctx, p.turbinen);
  await energieabrechnungen(ctx, p.id, jeMonat, [{ fundId: kg.id, anteil: 1 }], 9.1);
  await gesellschafter(ctx, kg.id, 40, 2_600_000, "AB");
  await prisma.dismantlingObligation.create({
    data: { tenantId: ctx.tenantId, parkId: p.id, estimatedCostTodayEur: 540_000, dismantlingYear: 2029, costInflationPercent: 2.5, requiredSecurityEur: 620_000, providedSecurityEur: 480_000, securityType: "BANK_GUARANTEE", securityProvider: "Testbank eG", costEstimateDate: new Date(Date.UTC(2025, 2, 1)), authorityReference: "LK WTM 63-4711" },
  });
  for (const [i, t] of p.turbinen.entries()) {
    const getauscht = i === 0;
    await prisma.majorComponent.create({
      data: { tenantId: ctx.tenantId, turbineId: t.id, type: "GENERATOR", manufacturer: "Enercon", installedAt: new Date(Date.UTC(2004, 5, 1)), designLifeYears: 20, removedAt: getauscht ? new Date(Date.UTC(2025, 9, 14)) : null, removalReason: getauscht ? "FAILURE" : null },
    });
    if (getauscht) {
      await prisma.majorComponent.create({ data: { tenantId: ctx.tenantId, turbineId: t.id, type: "GENERATOR", manufacturer: "Enercon", installedAt: new Date(Date.UTC(2025, 9, 20)), costEur: 185_000, notes: "Tausch nach Wicklungsschaden" } });
    }
    for (const pos of ["A", "B", "C"]) {
      await prisma.majorComponent.create({ data: { tenantId: ctx.tenantId, turbineId: t.id, type: "ROTOR_BLADE", position: pos, installedAt: new Date(Date.UTC(2004, 5, 1)), designLifeYears: 20 } });
    }
  }
  const ursachen = ["MANUFACTURER", "GRID", "WEATHER", "UNKNOWN"] as const;
  for (let i = 0; i < 8; i++) {
    const start = tage(-ganz(5, 300));
    const offen = i < 2;
    await prisma.faultCase.create({
      data: {
        tenantId: ctx.tenantId,
        caseNumber: nummer(ctx, "SF"),
        turbineId: wahl(p.turbinen).id,
        title: wahl(["Generatortemperatur zu hoch", "Pitchfehler Blatt B", "Netzausfall Umspannwerk", "Vereisung erkannt", "Azimutfehler"]),
        startAt: start,
        endAt: offen ? null : new Date(start.getTime() + ganz(2, 120) * 3_600_000),
        status: offen ? "OPEN" : wahl(["RESOLVED", "CLOSED"] as const),
        causeCategory: wahl(ursachen),
        lostEnergyKwh: ganz(800, 42_000),
        createdById: ctx.adminId,
      },
    });
  }
  const schaeden = [
    { titel: "Blitzschlag WEA 03 — Blattspitze", status: "CLAIM_IN_PROGRESS" as const },
    { titel: "Sturmschaden Trafostation", status: "RESOLVED" as const },
  ];
  for (const x of schaeden) {
    await prisma.insuranceClaim.create({
      data: { tenantId: ctx.tenantId, title: x.titel, incidentDate: tage(-ganz(30, 200)), claimType: "MACHINERY", status: x.status, estimatedCostEur: ganz(20_000, 90_000), parkId: p.id, turbineId: wahl(p.turbinen).id, createdById: ctx.adminId },
    });
  }
}

async function s10Scada() {
  const ort = ORTE[7];
  const ctx = await mandant({ slug: "scada", name: "SCADA Musterpark GmbH & Co. KG", tarif: "pro", ort });
  const kg = await gesellschaft(ctx, { name: "Musterpark Wackerow GmbH & Co. KG", rechtsform: "GmbH & Co. KG", kategorie: "BETREIBER", ort, kapital: 7_000_000 });
  const p = await park(ctx, { name: "Musterpark Wackerow", kurz: "MW", ort, wea: 5, inbetrieb: 2022, betreiberId: kg.id });
  const jeMonat = await produktion(ctx, p.turbinen);
  await energieabrechnungen(ctx, p.id, jeMonat, [{ fundId: kg.id, anteil: 1 }]);
  await gesellschafter(ctx, kg.id, 35, 7_000_000, "MW");

  // 10-minute values for the last 92 days: wind drifts around a mean of about
  // 7.5 m/s, power follows a power curve.
  const schritte = 92 * 144;
  const start = Date.UTC(HEUTE.getUTCFullYear(), HEUTE.getUTCMonth(), HEUTE.getUTCDate()) - schritte * 600_000;
  for (const t of p.turbinen) {
    let wind = 7;
    let richtung = 240;
    let stunden = 30_000 + ganz(0, 2000);
    const zeilen: Prisma.ScadaMeasurementCreateManyInput[] = [];
    for (let i = 0; i < schritte; i++) {
      wind = Math.max(0, Math.min(24, wind + (7.5 - wind) * 0.02 + (zufall() - 0.5) * 0.9));
      richtung = (richtung + (zufall() - 0.5) * 12 + 360) % 360;
      const stoerung = zufall() < 0.004;
      const leistungKw = stoerung || wind < 3 || wind > 22 ? 0 : Math.min(t.ratedPowerKw, t.ratedPowerKw * ((wind - 3) / 9) ** 3);
      if (leistungKw > 0) stunden += 1 / 6;
      zeilen.push({
        tenantId: ctx.tenantId,
        turbineId: t.id,
        timestamp: new Date(start + i * 600_000),
        sourceFile: "WSD",
        windSpeedMs: runde(wind, 2),
        windDirection: runde(richtung, 1),
        powerW: runde(leistungKw * 1000, 0),
        rotorRpm: leistungKw > 0 ? runde(6 + wind * 0.45, 2) : 0,
        operatingHours: runde(stunden, 2),
      });
    }
    for (let i = 0; i < zeilen.length; i += 5000) {
      await prisma.scadaMeasurement.createMany({ data: zeilen.slice(i, i + 5000) });
    }
  }
  // Market values (global table) — only where missing.
  await prisma.marketPrice.createMany({
    data: MONATE.map((m) => ({ year: m.jahr, month: m.monat, avgPriceEurMwh: runde(55 + zufall() * 45, 2) })),
    skipDuplicates: true,
  });
}

async function s11Weserland() {
  const ort = ORTE[4];
  const ctx = await mandant({ slug: "weserland", name: "Windpark-Gruppe Weserland", tarif: "enterprise", ort });
  await gesellschaft(ctx, { name: "Weserland Verwaltungs-GmbH", rechtsform: "GmbH", kategorie: "VERWALTUNG", ort });
  const uw = await gesellschaft(ctx, { name: "Umspannwerk Weserland GmbH & Co. KG", rechtsform: "GmbH & Co. KG", kategorie: "UMSPANNWERK", ort });
  const kbf = await gesellschaft(ctx, { name: "Weserland Kaufmännische BF GmbH", rechtsform: "GmbH", kategorie: "BETRIEBSFUEHRUNG", ort });
  const tbf = await gesellschaft(ctx, { name: "Weserland Technische BF GmbH", rechtsform: "GmbH", kategorie: "BETRIEBSFUEHRUNG", ort });

  const GEBUEHR = 0.005; // processing fee: 0.5 % of the revenue forwarded by the substation
  const plan = [
    { nr: 1, wea: 6, anleger: 30 },
    { nr: 2, wea: 4, anleger: 25 },
    { nr: 3, wea: 5, anleger: 28 },
  ];
  for (const x of plan) {
    const roem = "I".repeat(x.nr);
    const wp = await gesellschaft(ctx, { name: `Windpark Weserland ${roem} GmbH & Co. KG`, rechtsform: "GmbH & Co. KG", kategorie: "BETREIBER", ort, kapital: x.wea * 1_400_000 });
    const p = await park(ctx, { name: `Windpark Weserland ${roem}`, kurz: `WL${x.nr}`, ort, wea: x.wea, inbetrieb: 2018 + x.nr, betreiberId: wp.id, umspannwerkId: uw.id });
    await pacht(ctx, p.id, ort, 10, 7, wp.id);
    await gesellschafter(ctx, wp.id, x.anleger, x.wea * 1_400_000, `WL${x.nr}`);
    const jeMonat = await produktion(ctx, p.turbinen);
    // Grid operator → substation, settled per park and forwarded to the operator.
    await energieabrechnungen(ctx, p.id, jeMonat, [{ fundId: wp.id, anteil: 1 }]);

    for (const m of MONATE) {
      const kwh = jeMonat.get(`${m.jahr}-${m.monat}`) ?? 0;
      const erloes = runde((kwh * 7.6) / 100);
      const datum = new Date(Date.UTC(m.jahr, m.monat, 12)); // settled in the following month
      if (datum.getTime() > HEUTE.getTime()) continue;
      const alt = datum.getTime() < tage(-45).getTime();
      const monatstext = `${String(m.monat).padStart(2, "0")}/${m.jahr}`;
      // Abrechnung: the substation credits the operator its share.
      await rechnung(ctx, {
        typ: "CREDIT_NOTE",
        fundId: uw.id,
        parkId: p.id,
        empfaenger: wp.name,
        datum,
        positionen: [{ text: `Weiterleitung Einspeisevergütung ${monatstext} — ${kwh.toLocaleString("de-DE")} kWh`, netto: erloes, ust: 0 }],
        status: alt ? "PAID" : "SENT",
      });
      // Rechnung: the commercial management charges the processing fee.
      const kbfRe = await rechnung(ctx, {
        typ: "INVOICE",
        fundId: kbf.id,
        parkId: p.id,
        empfaenger: wp.name,
        datum,
        positionen: [
          { text: `Bearbeitungsgebühr Weiterleitung ${monatstext} (0,5 % von ${erloes.toLocaleString("de-DE")} €)`, netto: runde(erloes * GEBUEHR) },
          { text: `Kaufmännische Betriebsführung ${monatstext}`, netto: x.wea * 310 },
        ],
        status: alt ? "PAID" : "SENT",
      });
      // Mirrored by hand as incoming invoice of the operator (automatic mirroring: planned).
      await eingang(ctx, kbf.name, kbfRe, wp.id, alt ? "PAID" : "APPROVED");
      // Technical management: quarterly.
      if (m.monat % 3 === 0) {
        const tbfRe = await rechnung(ctx, {
          typ: "INVOICE",
          fundId: tbf.id,
          parkId: p.id,
          empfaenger: wp.name,
          datum,
          positionen: [
            { text: `Technische Betriebsführung Q${m.monat / 3}/${m.jahr}`, netto: x.wea * 1450 },
            { text: "Koordination Wartung und wiederkehrende Prüfungen", netto: ganz(900, 2600) },
          ],
          status: alt ? "PAID" : "SENT",
        });
        await eingang(ctx, tbf.name, tbfRe, wp.id, alt ? "PAID" : "REVIEW");
      }
    }
  }
}

async function eingang(
  ctx: Ctx,
  absender: string,
  re: { invoiceNumber: string; invoiceDate: Date; dueDate: Date | null; netAmount: Prisma.Decimal; taxAmount: Prisma.Decimal | null; grossAmount: Prisma.Decimal },
  empfaengerFundId: string,
  status: "PAID" | "APPROVED" | "REVIEW",
) {
  await prisma.incomingInvoice.create({
    data: {
      tenantId: ctx.tenantId,
      invoiceType: "INVOICE",
      status,
      vendorNameFallback: absender,
      invoiceNumber: re.invoiceNumber,
      invoiceDate: re.invoiceDate,
      dueDate: re.dueDate,
      netAmount: re.netAmount,
      vatAmount: re.taxAmount,
      grossAmount: re.grossAmount,
      vatRate: 19,
      recipientFundId: empfaengerFundId,
      fileUrl: `test/${ctx.slug}/${re.invoiceNumber}.pdf`,
      fileName: `${re.invoiceNumber}.pdf`,
      paidAt: status === "PAID" ? new Date(re.invoiceDate.getTime() + 12 * 86_400_000) : null,
      createdById: ctx.adminId,
    },
  });
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
  const beginn = Date.now();
  await grundlagen();
  await aufraeumen();

  const schritt = async <T,>(name: string, f: () => Promise<T>): Promise<T> => {
    const t0 = Date.now();
    const r = await f();
    console.log(`✓ ${name} — ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    return r;
  };

  const nordwind = await schritt(" 1 Nordwind (großer Betreiber, Support-Freigabe aktiv)", s1Nordwind);
  await schritt(" 2 Bürgerwindpark Kleinwind (400 Anleger, Portal, Abstimmungen)", s2Kleinwind);
  const hansen = await schritt(" 4 Hansen Windkraft (klein, aktiv / nur beteiligt)", s4Hansen);
  await schritt(" 3 BF-Service Nord (Betriebsführer für 1 und 4)", () =>
    s3BfService([
      { tenantId: nordwind.ctx.tenantId, parks: nordwind.parks, umsatz: 2_600_000 },
      { tenantId: hansen.ctx.tenantId, parks: hansen.parks, umsatz: 350_000 },
    ]),
  );
  await schritt(" 5 Grenzfall AG (Lizenz überschritten, Karenz läuft)", () => sLizenz("grenzfall", "Grenzfall AG", 8, 2, 20));
  await schritt(" 6 Überzogen GmbH (Karenz abgelaufen, gesperrt)", () => sLizenz("ueberzogen", "Überzogen GmbH", 7, 4, 45));
  await schritt(" 7+8 Weser-Holding Nord/Süd (ein Benutzer in beiden)", sHolding);
  await schritt(" 9 Altwind Repowering (Rückbau, Komponenten, Störfälle)", s9Altwind);
  await schritt("10 SCADA Musterpark (3 Monate 10-Minuten-Werte)", s10Scada);
  await schritt("11 Windpark-Gruppe Weserland (UW, KBF, TBF, Intercompany)", s11Weserland);

  console.log(`\nFertig in ${((Date.now() - beginn) / 1000).toFixed(0)} s. Passwort für alle Testbenutzer: ${PASSWORT}`);
  console.log("Logins: admin@<kürzel>.test, manager@<kürzel>.test, viewer@<kürzel>.test");
  console.log("Kürzel: nordwind, kleinwind, bf-service, hansen, grenzfall, ueberzogen, holding-nord, holding-sued, altwind, scada, weserland");
  console.log("Außerdem: leitung@holding.test (Nord + Süd), anleger1..5@kleinwind.test (Portal)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
