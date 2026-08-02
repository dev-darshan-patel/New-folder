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
      // No try/catch: Vercel Blob's del() is idempotent (does not throw for
      // an already-missing blob), so anything this throws — bad token,
      // network failure — is a real error the caller needs to see and log,
      // not one to swallow here.
      await del(url, { token });
    },
  };
}

export const vercelBlobProvider: StorageProvider = createVercelBlobProvider();
