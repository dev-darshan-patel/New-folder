import "server-only";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { StorageProvider } from "@/lib/storage/types";

// Works with real AWS S3 and any S3-compatible provider (Cloudflare R2,
// DigitalOcean Spaces, Backblaze B2, MinIO) by pointing S3_ENDPOINT at the
// provider's endpoint. Config is env-var-only for now — the admin-settings
// version of this (Phase B) reads the same shape from PlatformSettings.
export type S3Config = {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  // Public URL prefix objects are served from, e.g. a CDN domain or an R2/
  // Spaces public-bucket URL. Required for providers (R2 in particular)
  // that don't serve bucket contents over plain HTTPS by default.
  publicUrlBase?: string;
};

export function getS3ConfigFromEnv(): S3Config | null {
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) return null;

  return {
    bucket,
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    publicUrlBase: process.env.S3_PUBLIC_URL_BASE || undefined,
  };
}

function publicUrlPrefix(config: S3Config): string {
  if (config.publicUrlBase) return config.publicUrlBase.replace(/\/$/, "");
  if (config.endpoint) {
    // Path-style URL against the custom endpoint (works for MinIO and most
    // self-hosted setups; R2/Spaces usually need publicUrlBase instead since
    // their buckets aren't public over the API endpoint by default).
    return `${config.endpoint.replace(/\/$/, "")}/${config.bucket}`;
  }
  // Real AWS S3, virtual-hosted-style URL.
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com`;
}

export function createS3Provider(config: S3Config): StorageProvider {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  const prefix = publicUrlPrefix(config);

  return {
    async put(key, data, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: data,
          ContentType: contentType,
        }),
      );
      return { url: `${prefix}/${key}` };
    },
    async delete(url) {
      if (!url.startsWith(`${prefix}/`)) return; // not one of ours
      const key = url.slice(prefix.length + 1);
      // No try/catch: S3's DeleteObject is idempotent (succeeds silently on
      // an already-missing key), so anything this throws — bad credentials,
      // permission denial, network failure — is a real error the caller
      // needs to see and log, not one to swallow here.
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}
