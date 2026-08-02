import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM column encryption for secrets stored in the DB (TOTP secrets,
// OAuth refresh tokens, Stripe keys). The encryption key is held ONLY in an
// env var — a DB leak yields ciphertext, not plaintext.
//
// Format: base64(iv:authTag:ciphertext)  — 12-byte IV, 16-byte tag, variable ct.

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "ENCRYPTION_KEY env var is required. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).");
  }
  return buf;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(encoded: string): string {
  const key = getKey();
  const data = Buffer.from(encoded, "base64");
  if (data.length < IV_BYTES + TAG_BYTES) {
    throw new Error("Invalid encrypted value.");
  }
  const iv = data.subarray(0, IV_BYTES);
  const tag = data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = data.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

// Convenience: encrypt only if ENCRYPTION_KEY is set, otherwise return plaintext.
// This allows gradual adoption — existing unencrypted values still work until a
// migration re-encrypts them.
//
// That gradual-adoption case only makes sense for a deployment that already
// has plaintext rows predating this file. A brand-new install has none, so a
// missing key there isn't "gradual adoption" — it's an owner who forgot to
// set ENCRYPTION_KEY silently storing OAuth tokens and TOTP secrets in the
// clear. Refuse outright in production; keep the silent fallback only in
// dev/test, where generating a throwaway key for every local run is friction
// without a security benefit.
export function encryptIfConfigured(plaintext: string): string {
  if (!process.env.ENCRYPTION_KEY) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ENCRYPTION_KEY env var is required in production — refusing to store this value in plaintext. " +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      );
    }
    return plaintext;
  }
  return encrypt(plaintext);
}

// Decrypt if the value looks encrypted (base64 with correct prefix length),
// otherwise return as-is. Handles the transition period where some rows are
// encrypted and some aren't.
export function decryptIfNeeded(value: string): string {
  if (!process.env.ENCRYPTION_KEY) {
    // In production this almost always means the key was set (so this row
    // got encrypted) and then lost or removed — not "nothing here is
    // encrypted." Returning the raw ciphertext as if it were the real token
    // would fail confusingly downstream (e.g. a garbled OAuth call); throwing
    // here points straight at the actual problem.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "ENCRYPTION_KEY env var is required in production to read this value. " +
          "If it was set before and is now missing, restore it rather than regenerating a new one — a new key cannot decrypt data encrypted with the old one.",
      );
    }
    return value;
  }
  try {
    return decrypt(value);
  } catch {
    // Value isn't encrypted (pre-migration plaintext) — return as-is.
    return value;
  }
}
