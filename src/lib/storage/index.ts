import "server-only";
import type { StorageProvider } from "@/lib/storage/types";
import { createVercelBlobProvider } from "@/lib/storage/vercel-blob";
import { localDiskProvider } from "@/lib/storage/local-disk";
import { createS3Provider, type S3Config } from "@/lib/storage/s3";
import { getPlatformSettings } from "@/lib/settings";

export type { StorageProvider } from "@/lib/storage/types";

// Per-field DB-then-env fallback, same rule Stripe/Razorpay already use: the
// admin-settings DB value wins when set, otherwise the env var, so an
// existing env-var-only deployment keeps working untouched after upgrading
// to this DB-backed config.
function resolveS3Config(
  settings: Awaited<ReturnType<typeof getPlatformSettings>>,
): S3Config | null {
  const bucket = settings.s3Bucket || process.env.S3_BUCKET;
  const accessKeyId = settings.s3AccessKeyId || process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = settings.s3SecretAccessKey || process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) return null;

  return {
    bucket,
    region: settings.s3Region || process.env.S3_REGION || "auto",
    endpoint: settings.s3Endpoint || process.env.S3_ENDPOINT || undefined,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: settings.s3ForcePathStyle || process.env.S3_FORCE_PATH_STYLE === "true",
    publicUrlBase: settings.s3PublicUrlBase || process.env.S3_PUBLIC_URL_BASE || undefined,
  };
}

function hasBlobConfig(
  settings: Awaited<ReturnType<typeof getPlatformSettings>>,
): boolean {
  return Boolean(
    settings.vercelBlobReadWriteToken ||
      process.env.BLOB_READ_WRITE_TOKEN ||
      process.env.BLOB_STORE_ID,
  );
}

// Resolves which backend stores uploads. DB config (set at
// /admin/settings/storage) takes precedence over env vars per field, same
// pattern as Stripe. AUTO (the default) preserves the original env-var-only
// auto-detection so nothing breaks for a deployment that hasn't touched the
// new admin page: S3 wins if configured, else Vercel Blob, else local disk.
export async function getStorageProvider(): Promise<StorageProvider> {
  const settings = await getPlatformSettings();
  const explicit = settings.storageProvider;

  if (explicit === "S3") {
    const config = resolveS3Config(settings);
    if (!config) {
      throw new Error(
        "Storage provider is set to S3 but the bucket/access key/secret key aren't all configured.",
      );
    }
    return createS3Provider(config);
  }
  if (explicit === "VERCEL_BLOB") {
    return createVercelBlobProvider(settings.vercelBlobReadWriteToken || undefined);
  }
  if (explicit === "LOCAL") return localDiskProvider;

  // AUTO
  const s3Config = resolveS3Config(settings);
  if (s3Config) return createS3Provider(s3Config);
  if (hasBlobConfig(settings)) {
    return createVercelBlobProvider(settings.vercelBlobReadWriteToken || undefined);
  }
  return localDiskProvider;
}
