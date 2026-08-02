import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type { StorageProvider } from "@/lib/storage/types";

// Dev-only fallback: writes into public/uploads/, served by Next's static
// file handling. Works for local dev; doesn't persist across deploys on most
// serverless hosts (the filesystem is ephemeral), which is why production
// should configure Vercel Blob or S3 instead.
const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

function pathForKey(key: string): string {
  // key is server-generated (never user input directly), but guard against
  // traversal regardless — this still ends up as a real filesystem path.
  const safe = key.replace(/\\/g, "/").split("/").filter((seg) => seg && seg !== "..");
  return path.join(UPLOADS_ROOT, ...safe);
}

export const localDiskProvider: StorageProvider = {
  async put(key, data) {
    const filePath = pathForKey(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    return { url: `/uploads/${key}` };
  },
  async delete(url) {
    if (!url.startsWith("/uploads/")) return;
    const key = url.slice("/uploads/".length);
    try {
      await fs.unlink(pathForKey(key));
    } catch (err) {
      // Unlike S3/Blob, fs.unlink is not idempotent — it always throws for
      // an already-missing file. Swallow only that specific case; anything
      // else (permissions, disk error) is real and must reach the caller.
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
    }
  },
};
