import "server-only";
import { prisma } from "@/lib/prisma";

const SETTINGS_ID = "singleton";

// Fetches the one platform-settings row, creating it with defaults on first
// access. Not React-cached: callers that mutate settings need the next read
// (even within the same request, e.g. after revalidatePath) to see fresh data.
export async function getPlatformSettings() {
  const existing = await prisma.platformSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;
  return prisma.platformSettings.create({ data: { id: SETTINGS_ID } });
}

export { SETTINGS_ID };
