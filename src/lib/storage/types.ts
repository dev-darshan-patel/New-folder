// A file-storage backend for user uploads (currently just avatars). Every
// adapter must round-trip through a URL alone — put() returns one, delete()
// takes one back — since that's all Prisma stores (User.avatarUrl), so
// switching providers later never requires a data migration.
export interface StorageProvider {
  put(key: string, data: Buffer, contentType: string): Promise<{ url: string }>;
  // No-op (not an error) if the URL doesn't belong to this provider or the
  // object is already gone — callers (e.g. account purge) treat delete as
  // best-effort cleanup, not a correctness requirement.
  delete(url: string): Promise<void>;
}
