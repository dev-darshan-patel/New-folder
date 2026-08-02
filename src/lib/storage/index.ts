import "server-only";
import type { StorageProvider } from "@/lib/storage/types";
import { vercelBlobProvider } from "@/lib/storage/vercel-blob";
import { localDiskProvider } from "@/lib/storage/local-disk";
import { createS3Provider, getS3ConfigFromEnv } from "@/lib/storage/s3";

export type { StorageProvider } from "@/lib/storage/types";

// Resolves which backend stores uploads. Env-var-only for now (Phase A) —
// Phase B adds a PlatformSettings-backed override so this can be configured
// live at /admin/settings without a redeploy, same pattern as Stripe.
//
// Auto-detection (no explicit STORAGE_PROVIDER) exists so upgrading this
// file never breaks an existing deployment: whatever was already configured
// (Vercel Blob env vars) keeps winning without the owner touching anything.
export function getStorageProvider(): StorageProvider {
  const explicit = process.env.STORAGE_PROVIDER;

  if (explicit === "s3") {
    const s3Config = getS3ConfigFromEnv();
    if (!s3Config) {
      throw new Error(
        "STORAGE_PROVIDER=s3 but S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY aren't all set.",
      );
    }
    return createS3Provider(s3Config);
  }
  if (explicit === "vercel-blob") return vercelBlobProvider;
  if (explicit === "local") return localDiskProvider;

  const s3Config = getS3ConfigFromEnv();
  if (s3Config) return createS3Provider(s3Config);
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) return vercelBlobProvider;
  return localDiskProvider;
}
