// Encrypts secrets that are still stored in plaintext, using the current
// ENCRYPTION_KEY.
//
// src/lib/crypto.ts describes a "gradual adoption" path — values written
// before ENCRYPTION_KEY was set stay readable, "until a migration re-encrypts
// them". This is that migration, which had never actually been written. Until
// it runs, anything stored before encryption was switched on sits in the clear
// and is readable by anyone with database access, which is exactly what
// encrypting at rest is supposed to prevent.
//
//   node --env-file=.env scripts/encrypt-plaintext-secrets.mjs           # dry run
//   node --env-file=.env scripts/encrypt-plaintext-secrets.mjs --apply   # write
//
// Safety properties, because these are live credentials:
//   - Dry run by default. Nothing is written without --apply.
//   - Idempotent: values that already look like ciphertext are skipped, so
//     re-running is harmless.
//   - Every write is verified by reading the value back and decrypting it. If
//     it does not match the original byte for byte, the original is restored
//     immediately and the script stops.
//   - Secret values are never printed — only field names and lengths.
//
// Stop the app first if you can. Not because a concurrent write corrupts
// anything (it does not — the script only rewrites values it read moments
// earlier, and verifies), but because a settings save landing mid-run would
// simply be missed and need another pass.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");

const keyHex = process.env.ENCRYPTION_KEY;
if (!keyHex || Buffer.from(keyHex, "hex").length !== 32) {
  console.error("ENCRYPTION_KEY must be set and be 64 hex characters (32 bytes).");
  process.exit(1);
}
const key = Buffer.from(keyHex, "hex");

// Byte-for-byte the format in src/lib/crypto.ts.
function encrypt(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}
function decrypt(b64) {
  const data = Buffer.from(b64, "base64");
  const d = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  d.setAuthTag(data.subarray(12, 28));
  return d.update(data.subarray(28)) + d.final("utf8");
}
function looksLikeCiphertext(v) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(v)) return false;
  try {
    return Buffer.from(v, "base64").length >= 29;
  } catch {
    return false;
  }
}

const prisma = new PrismaClient();
let migrated = 0;
let skipped = 0;
let otherKey = 0;
let failed = 0;

// `write` takes the new value and persists it; `read` returns the stored value.
// Keeping them as callbacks lets one routine handle both tables safely.
async function migrateField(label, current, write, read) {
  if (!current) return;
  if (looksLikeCiphertext(current)) {
    // Already encrypted — but only count it as such if it actually decrypts,
    // otherwise it belongs to a different key and is a separate problem
    // (see scripts/check-encryption.mjs).
    try {
      decrypt(current);
      skipped++;
    } catch {
      // Encrypted under a key we no longer have. NOT this script's problem to
      // solve and definitely not something to overwrite — re-encrypting would
      // destroy any chance of recovery if the old key turns up. Reported, but
      // it does not fail the run: this migration's job is plaintext, and it
      // correctly left this alone. scripts/check-encryption.mjs is what owns
      // reporting key mismatches.
      console.log(`  LEFT ALONE (encrypted under a different key)  ${label}`);
      otherKey++;
    }
    return;
  }

  if (!APPLY) {
    console.log(`  would encrypt  ${label}  (${current.length} chars)`);
    migrated++;
    return;
  }

  const ciphertext = encrypt(current);
  await write(ciphertext);

  // Read back from the database rather than trusting the in-memory value —
  // this is what proves the round trip really survived storage.
  const stored = await read();
  let ok = false;
  try {
    ok = decrypt(stored) === current;
  } catch {
    ok = false;
  }

  if (!ok) {
    await write(current); // restore
    console.error(`  FAILED — restored original  ${label}`);
    failed++;
    throw new Error(`Verification failed for ${label}; original restored, aborting.`);
  }

  console.log(`  encrypted + verified  ${label}`);
  migrated++;
}

const SETTINGS_FIELDS = [
  "stripeTestSecretKey",
  "stripeTestWebhookSecret",
  "stripeLiveSecretKey",
  "stripeLiveWebhookSecret",
  "razorpayTestKeySecret",
  "razorpayTestWebhookSecret",
  "razorpayLiveKeySecret",
  "razorpayLiveWebhookSecret",
  "googleClientSecret",
  "microsoftClientSecret",
  "zoomClientSecret",
  "vercelBlobReadWriteToken",
  "s3SecretAccessKey",
  "sesSmtpPass",
  "gmailSmtpPass",
];

console.log(APPLY ? "APPLYING changes\n" : "DRY RUN — nothing will be written (pass --apply to write)\n");

try {
  console.log("PlatformSettings:");
  const settings = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
  if (settings) {
    for (const field of SETTINGS_FIELDS) {
      if (!(field in settings)) continue;
      await migrateField(
        `PlatformSettings.${field}`,
        settings[field],
        (v) =>
          prisma.platformSettings.update({ where: { id: "singleton" }, data: { [field]: v } }),
        async () =>
          (
            await prisma.platformSettings.findUnique({
              where: { id: "singleton" },
              select: { [field]: true },
            })
          )[field],
      );
    }
  }

  console.log("\nCalendarConnection:");
  for (const conn of await prisma.calendarConnection.findMany()) {
    const where = { userId_provider: { userId: conn.userId, provider: conn.provider } };
    for (const field of ["accessToken", "refreshToken"]) {
      await migrateField(
        `${conn.provider}.${field} [user ${conn.userId.slice(0, 8)}]`,
        conn[field],
        (v) => prisma.calendarConnection.update({ where, data: { [field]: v } }),
        async () =>
          (await prisma.calendarConnection.findUnique({ where, select: { [field]: true } }))[field],
      );
    }
  }
} finally {
  await prisma.$disconnect();
}

console.log("");
console.log(`  ${APPLY ? "encrypted" : "would encrypt"}  ${migrated}`);
console.log(`  already encrypted  ${skipped}`);
if (otherKey) {
  console.log(`  left alone         ${otherKey}  (encrypted under a different key — see scripts/check-encryption.mjs)`);
}
if (failed) console.log(`  FAILED             ${failed}`);
if (!APPLY && migrated > 0) console.log("\nRe-run with --apply to write these changes.");
process.exit(failed > 0 ? 1 : 0);
