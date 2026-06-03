/**
 * One-shot migration: encrypt existing plaintext Webhook.secret values.
 *
 * Idempotent: skips rows whose `secret` already looks encrypted (base64 with
 * the expected AES-GCM envelope length, per `isEncrypted()` from
 * @/lib/email/encryption).
 *
 * USAGE (run ONCE after deploying the encryption-middleware change):
 *   DATABASE_URL=... ENCRYPTION_KEY=... \
 *     npx tsx scripts/encrypt-webhook-secrets.ts
 *
 * Container example:
 *   docker exec -it app sh -c \
 *     'NODE_PATH=/prisma-cli/node_modules \
 *      /prisma-cli/node_modules/.bin/tsx scripts/encrypt-webhook-secrets.ts'
 *
 * NOTE: We bypass the Prisma extension here so we can re-write the raw column
 * value with the encrypted form. After this migration runs, the extension
 * transparently handles encrypt-on-write and decrypt-on-read.
 */

import { PrismaClient } from "@prisma/client";
import { encrypt, isEncrypted } from "../src/lib/email/encryption";

async function main() {
  // Plain PrismaClient — NOT wrapped with withEncryption — so we read/write raw values.
  const prisma = new PrismaClient();

  try {
    const webhooks = await prisma.webhook.findMany({
      select: { id: true, secret: true },
    });

    let encrypted = 0;
    let skipped = 0;
    let errored = 0;

    for (const wh of webhooks) {
      if (!wh.secret || wh.secret === "") {
        skipped++;
        continue;
      }
      if (isEncrypted(wh.secret)) {
        skipped++;
        continue;
      }

      try {
        const cipher = encrypt(wh.secret);
        await prisma.webhook.update({
          where: { id: wh.id },
          data: { secret: cipher },
        });
        encrypted++;
        // eslint-disable-next-line no-console
        console.log(`  encrypted webhook ${wh.id}`);
      } catch (err) {
        errored++;
        // eslint-disable-next-line no-console
        console.error(`  failed webhook ${wh.id}:`, err);
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `\nDone. total=${webhooks.length} encrypted=${encrypted} skipped=${skipped} errored=${errored}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
