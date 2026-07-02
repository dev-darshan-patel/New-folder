import "server-only";
import type { AdminRole, User } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";

const RANK: Record<AdminRole, number> = {
  READ_ONLY: 0,
  SUPPORT: 1,
  SUPER_ADMIN: 2,
};

// Require the current user to be an admin with at least `min` privilege.
// Throws if not authenticated, not an admin, or under-privileged — callers
// (server actions) should let this throw; Next.js surfaces it as an error.
export async function requireAdminRole(min: AdminRole): Promise<User> {
  const user = await getCurrentUser();
  if (!user || !user.adminRole) throw new Error("Not authorized");
  if (RANK[user.adminRole] < RANK[min]) {
    throw new Error(`Requires ${min} or higher`);
  }
  return user;
}
