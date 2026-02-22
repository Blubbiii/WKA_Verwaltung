import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.systemConfig.findFirst({
    where: { key: "management-billing.enabled" },
  });

  if (existing) {
    // Update to true
    await prisma.systemConfig.update({
      where: { id: existing.id },
      data: { value: "true" },
    });
    console.log("Feature-Flag aktualisiert: management-billing.enabled = true");
  } else {
    await prisma.systemConfig.create({
      data: {
        key: "management-billing.enabled",
        value: "true",
        encrypted: false,
        category: "features",
        label: "Betriebsfuehrung aktiviert",
        tenantId: null,
      },
    });
    console.log("Feature-Flag erstellt: management-billing.enabled = true");
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("Fehler:", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
