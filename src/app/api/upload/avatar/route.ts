import { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import fs from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyCsrfOrigin } from "@/lib/csrf";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Validate actual file content via magic bytes, not the attacker-controlled MIME header.
const MAGIC_BYTES: [string, number[]][] = [
  ["image/jpeg", [0xff, 0xd8, 0xff]],
  ["image/png", [0x89, 0x50, 0x4e, 0x47]],
  ["image/gif", [0x47, 0x49, 0x46, 0x38]],
  ["image/webp", [0x52, 0x49, 0x46, 0x46]], // RIFF header; "WEBP" at offset 8
];

function detectImageType(buf: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buf, 0, Math.min(12, buf.byteLength));
  for (const [type, magic] of MAGIC_BYTES) {
    if (magic.every((b, i) => bytes[i] === b)) {
      if (type === "image/webp") {
        // RIFF container — verify "WEBP" at offset 8.
        if (bytes[8] !== 0x57 || bytes[9] !== 0x45 || bytes[10] !== 0x42 || bytes[11] !== 0x50) continue;
      }
      return type;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return Response.json({ error: "Invalid origin." }, { status: 403 });
    }
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return Response.json({ error: "No file provided." }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type))
      return Response.json({ error: "Only JPEG, PNG, WebP, or GIF images are allowed." }, { status: 400 });
    if (file.size > MAX_BYTES)
      return Response.json({ error: "Image must be 5 MB or smaller." }, { status: 400 });

    // Validate magic bytes — the MIME header is attacker-controlled.
    const fileBytes = await file.arrayBuffer();
    const detectedType = detectImageType(fileBytes);
    if (!detectedType || !ALLOWED_TYPES.has(detectedType)) {
      return Response.json({ error: "File content doesn't match an allowed image format." }, { status: 400 });
    }

    const ext = detectedType.split("/")[1].replace("jpeg", "jpg");
    const filename = `${user.id}-${Date.now()}.${ext}`;

    let url: string;

    if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) {
      // Production: Vercel Blob (public store — direct CDN URL)
      const blob = await put(`avatars/${filename}`, Buffer.from(fileBytes), { access: "public" });
      url = blob.url;
    } else {
      // Local dev fallback: write to public/uploads/avatars/
      try {
        const uploadsDir = path.join(process.cwd(), "public", "uploads", "avatars");
        await fs.mkdir(uploadsDir, { recursive: true });
        await fs.writeFile(path.join(uploadsDir, filename), Buffer.from(fileBytes));
        url = `/uploads/avatars/${filename}`;
      } catch (fsErr) {
        const msg = fsErr instanceof Error ? fsErr.message : String(fsErr);
        return Response.json({ error: `Storage not configured: ${msg}` }, { status: 503 });
      }
    }

    await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: url } });
    return Response.json({ url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Avatar upload error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return Response.json({ error: "Invalid origin." }, { status: 403 });
    }
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: null } });
    return Response.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Avatar delete error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
