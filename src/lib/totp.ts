import "server-only";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import bcrypt from "bcryptjs";
import { encryptIfConfigured, decryptIfNeeded } from "@/lib/crypto";

// Generate a new base32 TOTP secret for enrollment.
export function generateTotpSecret(): string {
  return generateSecret();
}

// Build the otpauth:// URI the authenticator app scans, then render it
// as a data-URL PNG QR code for inline <img> use.
export async function makeQrDataUrl(params: {
  secret: string;
  email: string;
  appName: string;
}): Promise<{ otpauth: string; qrDataUrl: string }> {
  const otpauth = generateURI({
    issuer: params.appName,
    label: params.email,
    secret: params.secret,
  });
  const qrDataUrl = await QRCode.toDataURL(otpauth);
  return { otpauth, qrDataUrl };
}

export function verifyTotp(storedSecret: string, code: string): boolean {
  const secret = decryptIfNeeded(storedSecret);
  const clean = code.replace(/\s/g, "");
  // Without a tolerance window, otplib only accepts a code matching the exact
  // current 30s time step — any clock drift between server and phone, or just
  // the few seconds it takes to read and type the code, causes a false
  // rejection. Allow one step (30s) before/after, the standard window used by
  // virtually every other TOTP server implementation (Google Authenticator, etc).
  const result = verifySync({ token: clean, secret, epochTolerance: 30 });
  return result.valid;
}

// Encrypt a TOTP secret before storing in the DB.
export function encryptTotpSecret(secret: string): string {
  return encryptIfConfigured(secret);
}

// Decrypt a TOTP secret read from the DB (for QR display during setup).
export function decryptTotpSecret(storedSecret: string): string {
  return decryptIfNeeded(storedSecret);
}

// Generate N 10-character alphanumeric backup codes for user download.
// Returns plain codes (show to user once) and their bcrypt hashes (persist).
export async function generateBackupCodes(n = 10): Promise<{ plain: string[]; hashed: string[] }> {
  const plain: string[] = [];
  for (let i = 0; i < n; i++) {
    const s = Math.random().toString(36).slice(2, 7) + "-" + Math.random().toString(36).slice(2, 7);
    plain.push(s);
  }
  const hashed = await Promise.all(plain.map((c) => bcrypt.hash(c, 8)));
  return { plain, hashed };
}

// Check a submitted code against stored bcrypt-hashed backup codes.
// Returns the remaining hashed codes with the matched one removed, or null on no match.
export async function consumeBackupCode(
  submitted: string,
  hashedCodes: string[],
): Promise<string[] | null> {
  const target = submitted.replace(/\s/g, "").toLowerCase();
  for (let i = 0; i < hashedCodes.length; i++) {
    if (await bcrypt.compare(target, hashedCodes[i])) {
      return hashedCodes.filter((_, idx) => idx !== i);
    }
  }
  return null;
}
