-- CreateEnum
CREATE TYPE "StorageProviderType" AS ENUM ('AUTO', 'LOCAL', 'VERCEL_BLOB', 'S3');

-- AlterTable
ALTER TABLE "PlatformSettings" ADD COLUMN     "storageProvider" "StorageProviderType" NOT NULL DEFAULT 'AUTO',
ADD COLUMN     "vercelBlobReadWriteToken" TEXT,
ADD COLUMN     "s3Bucket" TEXT,
ADD COLUMN     "s3Region" TEXT NOT NULL DEFAULT 'auto',
ADD COLUMN     "s3Endpoint" TEXT,
ADD COLUMN     "s3AccessKeyId" TEXT,
ADD COLUMN     "s3SecretAccessKey" TEXT,
ADD COLUMN     "s3PublicUrlBase" TEXT,
ADD COLUMN     "s3ForcePathStyle" BOOLEAN NOT NULL DEFAULT false;
