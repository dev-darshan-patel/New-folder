// Verifies that every encrypted column can actually be decrypted with the
// ENCRYPTION_KEY currently in the environment. Read-only — safe to run against
// production.
//
// Why this exists: decryptIfNeeded() deliberately returns a value unchanged
// when decryption fails, because values written before encryption was switched
// on are legitimate plaintext. The side effect is that a CHANGED key looks
// identical to "not encrypted" — 2FA silently stops matching and calendar sync
// silently stops working, with nothing to point at. A restore drill found
// exactly that. This makes the check explicit and runnable in seconds.
//
//   node --env-file=.env scripts/check-encryption.mjs
//
// Exit 0 = everything readable. Exit 1 = at least one value is unrecoverable
// with this key.
import { createDecipheriv } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const keyHex = process.env.ENCRYPTION_KEY;
if (!keyHex) {
  console.error("ENCRYPTION_KEY is not set — nothing to check against.");
  process.exit(1);
}
if (Buffer.from(keyHex, "hex").length !== 32) {
  console.error("ENCRYPTION_KEY must be 64 hex characters (32 bytes).");
  process.exit(1);
}
const key = Buffer.from(keyHex, "hex");

// Mirrors src/lib/crypto.ts: base64(iv[12] | authTag[16] | ciphertext).
function decrypt(b64) {
  const data = Buffer.from(b64, "base64");
  const d = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  d.setAuthTag(data.subarray(12, 28));
  return d.update(data.subarray(28)) + d.final("utf8");
}

// Same heuristic the app uses: only values that genuinely look like ciphertext
// are expected to decrypt. Legitimate pre-encryption plaintext is not a fault.
function looksLikeCiphertext(v) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(v)) return false;
  try {
    return Buffer.from(v, "base64").length >= 29;
  } catch {
    return false;
  }
}

const prisma = new PrismaClient();
let unreadable = 0;
let plaintext = 0;
let ok = 0;

function check(label, value) {
  if (!value) return;
  if (!looksLikeCiphertext(value)) {
    plaintext++;
    return;
  }
  try {
    decrypt(value);
    ok++;
  } catch {
    unreadable++;
    console.log(`  UNREADABLE  ${label}`);
  }
}

const users = await prisma.user.findMany({
  where: { totpSecret: { not: null } },
  select: { email: true, totpSecret: true },
});
for (const u of users) check(`totpSecret  ${u.email}`, u.totpSecret);

const connections = await prisma.calendarConnection.findMany();
for (const c of connections) {
  check(`${c.provider} accessToken  (user ${c.userId})`, c.accessToken);
  check(`${c.provider} refreshToken (user ${c.userId})`, c.refreshToken);
}

const settings = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
if (settings) {
  for (const field of [
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
    "vercelBlobReadWriteToken",
    "s3SecretAccessKey",
  ]) {
    check(`PlatformSettings.${field}`, settings[field]);
  }
}

await prisma.$disconnect();

console.log("");
console.log(`  decrypted OK        ${ok}`);
console.log(`  stored as plaintext ${plaintext}  (written before encryption was enabled — readable, but not protected at rest)`);
console.log(`  UNREADABLE          ${unreadable}`);

if (unreadable > 0) {
  console.log("");
  console.log("These were encrypted with a DIFFERENT key than the one in this environment.");
  console.log("A new key cannot decrypt them. Affected users must re-enrol 2FA and");
  console.log("reconnect calendars. If you still have the previous key, restore it.");
  process.exit(1);
}
console.log("\nAll encrypted values decrypt with the current key.");
