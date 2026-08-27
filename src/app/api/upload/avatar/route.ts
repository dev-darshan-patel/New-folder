import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getStorageProvider } from "@/lib/storage";
import { validateImageUpload, extensionForImageType } from "@/lib/image-upload";
import logger from "@/lib/logger";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

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

    // Declared type, size, then real content via magic bytes.
    const validated = await validateImageUpload(file, MAX_BYTES);
    if (!validated.ok) {
      return Response.json({ error: validated.error }, { status: validated.status });
    }
    const { bytes: fileBytes, type: detectedType } = validated;

    const ext = extensionForImageType(detectedType);
    const filename = `${user.id}-${Date.now()}.${ext}`;

    let url: string;
    const storage = await getStorageProvider();
    try {
      const result = await storage.put(`avatars/${filename}`, Buffer.from(fileBytes), detectedType);
      url = result.url;
    } catch (storageErr) {
      const msg = storageErr instanceof Error ? storageErr.message : String(storageErr);
      return Response.json({ error: `Storage not configured: ${msg}` }, { status: 503 });
    }

    // Replacing an existing avatar — clean up the old object so uploads don't
    // accumulate unboundedly in the bucket/disk.
    const previous = await prisma.user.findUnique({ where: { id: user.id }, select: { avatarUrl: true } });
    await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: url } });
    if (previous?.avatarUrl && previous.avatarUrl !== url) {
      try {
        await storage.delete(previous.avatarUrl);
      } catch (err) {
        logger.error({ err, userId: user.id }, "Failed to delete previous avatar during replace");
      }
    }
    return Response.json({ url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Avatar upload error");
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
    logger.error({ err }, "Avatar delete error");
    return Response.json({ error: msg }, { status: 500 });
  }
}
