import { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import fs from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return Response.json({ error: "No file provided." }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type))
      return Response.json({ error: "Only JPEG, PNG, WebP, or GIF images are allowed." }, { status: 400 });
    if (file.size > MAX_BYTES)
      return Response.json({ error: "Image must be 5 MB or smaller." }, { status: 400 });

    const ext = file.type.split("/")[1].replace("jpeg", "jpg");
    const filename = `${user.id}-${Date.now()}.${ext}`;

    let url: string;

    if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) {
      // Production: Vercel Blob (supports both token and OIDC auth)
      const blob = await put(`avatars/${filename}`, file, { access: "public" });
      url = blob.url;
    } else {
      // Local dev fallback: write to public/uploads/avatars/
      try {
        const uploadsDir = path.join(process.cwd(), "public", "uploads", "avatars");
        await fs.mkdir(uploadsDir, { recursive: true });
        const bytes = await file.arrayBuffer();
        await fs.writeFile(path.join(uploadsDir, filename), Buffer.from(bytes));
        url = `/uploads/avatars/${filename}`;
      } catch {
        return Response.json(
          {
            error:
              "File storage is not configured. In Vercel, go to Storage → Create Blob store and link it to this project — Vercel will inject BLOB_READ_WRITE_TOKEN automatically.",
          },
          { status: 503 },
        );
      }
    }

    await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: url } });
    return Response.json({ url });
  } catch (err) {
    console.error("Avatar upload error:", err);
    return Response.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: null } });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("Avatar delete error:", err);
    return Response.json({ error: "Failed to remove photo." }, { status: 500 });
  }
}
