import { describe, it, expect, vi, afterEach } from "vitest";
import { encrypt, decrypt, encryptIfConfigured, decryptIfNeeded } from "@/lib/crypto";

const KEY = "a".repeat(64); // 32 bytes as hex

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("encrypt / decrypt", () => {
  it("round-trips a value", () => {
    vi.stubEnv("ENCRYPTION_KEY", KEY);
    const secret = "sk_live_abc123";
    expect(decrypt(encrypt(secret))).toBe(secret);
  });

  it("does not leave the plaintext recoverable in the ciphertext", () => {
    vi.stubEnv("ENCRYPTION_KEY", KEY);
    const secret = "sk_live_abc123";
    const encrypted = encrypt(secret);
    expect(encrypted).not.toBe(secret);
    expect(encrypted).not.toContain(secret);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    vi.stubEnv("ENCRYPTION_KEY", KEY);
    // Equal ciphertexts for equal plaintexts would leak which settings share
    // a value across rows.
    expect(encrypt("same-value")).not.toBe(encrypt("same-value"));
  });

  it("rejects a tampered ciphertext instead of returning garbage", () => {
    vi.stubEnv("ENCRYPTION_KEY", KEY);
    const encrypted = encrypt("sk_live_abc123");
    const raw = Buffer.from(encrypted, "base64");
    raw[raw.length - 1] ^= 0xff; // flip bits in the ciphertext body
    expect(() => decrypt(raw.toString("base64"))).toThrow();
  });

  it("refuses a key that isn't 32 bytes", () => {
    vi.stubEnv("ENCRYPTION_KEY", "abcd");
    expect(() => encrypt("x")).toThrow(/64 hex characters/i);
  });

  it("refuses to run with no key at all", () => {
    vi.stubEnv("ENCRYPTION_KEY", "");
    expect(() => encrypt("x")).toThrow(/ENCRYPTION_KEY/);
  });
});

describe("encryptIfConfigured", () => {
  it("encrypts when a key is set", () => {
    vi.stubEnv("ENCRYPTION_KEY", KEY);
    const out = encryptIfConfigured("sk_live_abc123");
    expect(out).not.toBe("sk_live_abc123");
    expect(decrypt(out)).toBe("sk_live_abc123");
  });

  it("throws in production when no key is set, rather than storing plaintext", () => {
    // The whole point of the guard: without this, an owner who forgets to set
    // ENCRYPTION_KEY silently writes OAuth tokens, TOTP secrets and payment
    // credentials to the database in the clear.
    vi.stubEnv("ENCRYPTION_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => encryptIfConfigured("sk_live_abc123")).toThrow(/ENCRYPTION_KEY/);
  });

  it("falls back to plaintext outside production so local dev needs no key", () => {
    vi.stubEnv("ENCRYPTION_KEY", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(encryptIfConfigured("sk_test_abc123")).toBe("sk_test_abc123");
  });
});

describe("decryptIfNeeded", () => {
  it("decrypts a value written by encryptIfConfigured", () => {
    vi.stubEnv("ENCRYPTION_KEY", KEY);
    expect(decryptIfNeeded(encryptIfConfigured("sk_live_abc123"))).toBe("sk_live_abc123");
  });

  // This is the assumption the PlatformSettings encryption rollout relies on:
  // rows written before encryption existed are still plaintext, and must keep
  // working with no migration. A real API key fails the AES-GCM auth check
  // when treated as ciphertext, so it falls through unchanged.
  it("passes through pre-existing plaintext even when a key is configured", () => {
    vi.stubEnv("ENCRYPTION_KEY", KEY);
    for (const legacy of [
      "sk_live_51ABCdefGHIjklMNOpqrs",
      "whsec_abcdef123456",
      "rzp_live_AbCdEf123456",
      "some-smtp-password",
    ]) {
      expect(decryptIfNeeded(legacy)).toBe(legacy);
    }
  });

  it("throws in production when the key is missing", () => {
    // Almost always means a key that was set has been lost — returning raw
    // ciphertext would fail confusingly much later, at the API call.
    vi.stubEnv("ENCRYPTION_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => decryptIfNeeded("anything")).toThrow(/ENCRYPTION_KEY/);
  });

  it("returns the value as-is outside production when no key is set", () => {
    vi.stubEnv("ENCRYPTION_KEY", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(decryptIfNeeded("plain-value")).toBe("plain-value");
  });
});
