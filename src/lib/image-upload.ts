// Shared validation for user-uploaded images (avatars, ticket artwork).
//
// Deliberately NOT `server-only`: the magic-byte table is the security-
// relevant part of every image upload in the app, and keeping it importable
// by tests is what lets it be verified directly rather than only through a
// live HTTP route.

export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

// Validate actual file content via magic bytes, not the attacker-controlled
// MIME header — a .exe renamed to .png announces itself as image/png.
const MAGIC_BYTES: [string, number[]][] = [
  ["image/jpeg", [0xff, 0xd8, 0xff]],
  ["image/png", [0x89, 0x50, 0x4e, 0x47]],
  ["image/gif", [0x47, 0x49, 0x46, 0x38]],
  ["image/webp", [0x52, 0x49, 0x46, 0x46]], // RIFF header; "WEBP" at offset 8
];

export function detectImageType(buf: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buf, 0, Math.min(12, buf.byteLength));
  for (const [type, magic] of MAGIC_BYTES) {
    if (magic.every((b, i) => bytes[i] === b)) {
      if (type === "image/webp") {
        // RIFF is a generic container (also .wav, .avi) — only the "WEBP"
        // FourCC at offset 8 makes it an image.
        if (bytes[8] !== 0x57 || bytes[9] !== 0x45 || bytes[10] !== 0x42 || bytes[11] !== 0x50) {
          continue;
        }
      }
      return type;
    }
  }
  return null;
}

// Storage key extension for a validated type. "jpeg" -> "jpg" only because
// that's the conventional file extension.
export function extensionForImageType(type: string): string {
  return type.split("/")[1].replace("jpeg", "jpg");
}

export type ImageValidationError = { error: string; status: number };

// The full check every upload route runs, in one place: declared type,
// size, then real content. Returns either the trustworthy detected type +
// bytes, or a ready-to-return error with its HTTP status.
export async function validateImageUpload(
  file: File,
  maxBytes: number,
): Promise<{ ok: true; bytes: ArrayBuffer; type: string } | { ok: false } & ImageValidationError> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { ok: false, error: "Only JPEG, PNG, WebP, or GIF images are allowed.", status: 400 };
  }
  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return { ok: false, error: `Image must be ${mb} MB or smaller.`, status: 400 };
  }
  const bytes = await file.arrayBuffer();
  const type = detectImageType(bytes);
  if (!type || !ALLOWED_IMAGE_TYPES.has(type)) {
    return {
      ok: false,
      error: "File content doesn't match an allowed image format.",
      status: 400,
    };
  }
  return { ok: true, bytes, type };
}
