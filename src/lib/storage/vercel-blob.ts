import "server-only";
import { put, del } from "@vercel/blob";
import type { StorageProvider } from "@/lib/storage/types";

// token is optional — when omitted, @vercel/blob falls back to
// process.env.BLOB_READ_WRITE_TOKEN itself (Vercel injects that
// automatically for an attached store). Only needed to override.
export function createVercelBlobProvider(token?: string): StorageProvider {
  return {
    async put(key, data, contentType) {
      const blob = await put(key, data, { access: "public", contentType, token });
      return { url: blob.url };
    },
    async delete(url) {
      try {
        await del(url, { token });
      } catch {
        // Already gone, or not a blob URL — best-effort cleanup.
      }
    },
  };
}

export const vercelBlobProvider: StorageProvider = createVercelBlobProvider();
