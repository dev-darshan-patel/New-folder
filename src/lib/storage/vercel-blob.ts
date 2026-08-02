import "server-only";
import { put, del } from "@vercel/blob";
import type { StorageProvider } from "@/lib/storage/types";

export const vercelBlobProvider: StorageProvider = {
  async put(key, data, contentType) {
    const blob = await put(key, data, { access: "public", contentType });
    return { url: blob.url };
  },
  async delete(url) {
    try {
      await del(url);
    } catch {
      // Already gone, or not a blob URL — best-effort cleanup.
    }
  },
};
