import "server-only";
import { prisma } from "@/lib/prisma";
import { uniqueUserSlug } from "@/lib/slug";
import type { OAuthProfile, OAuthProvider } from "@/lib/oauth";

export type OAuthLoginResult =
  | { ok: true; userId: string }
  | { ok: false; error: "email_not_verified" | "suspended" | "deleted" };

function finish(user: {
  id: string;
  suspended: boolean;
  deletedAt: Date | null;
}): OAuthLoginResult {
  if (user.deletedAt) return { ok: false, error: "deleted" };
  if (user.suspended) return { ok: false, error: "suspended" };
  return { ok: true, userId: user.id };
}

// Resolve an OAuth profile to a User: match by provider id, else link by
// verified email to an existing account, else create a brand-new tenant
// (mirroring the defaults email signup gets — availability + a starter event
// type, FREE plan, no password since this account is OAuth-only so far).
export async function findOrCreateOAuthUser(
  provider: OAuthProvider,
  profile: OAuthProfile,
): Promise<OAuthLoginResult> {
  if (!profile.emailVerified) return { ok: false, error: "email_not_verified" };

  const byProviderId = await prisma.user.findUnique({
    where:
      provider === "google"
        ? { googleId: profile.providerId }
        : { microsoftId: profile.providerId },
  });
  if (byProviderId) return finish(byProviderId);

  const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
  if (byEmail) {
    const linked = await prisma.user.update({
      where: { id: byEmail.id },
      data: {
        ...(provider === "google"
          ? { googleId: profile.providerId }
          : { microsoftId: profile.providerId }),
        // The provider verified this email, so mark the account verified too.
        ...(byEmail.emailVerifiedAt
          ? {}
          : {
              emailVerifiedAt: new Date(),
              emailVerifyToken: null,
              emailVerifyExpiresAt: null,
            }),
      },
    });
    return finish(linked);
  }

  const slug = await uniqueUserSlug(profile.name || profile.email);
  const created = await prisma.user.create({
    data: {
      name: profile.name || profile.email,
      businessName: profile.name || profile.email,
      email: profile.email,
      slug,
      // OAuth providers only hand us verified emails (checked above).
      emailVerifiedAt: new Date(),
      ...(provider === "google"
        ? { googleId: profile.providerId }
        : { microsoftId: profile.providerId }),
      eventTypes: {
        create: {
          title: "30 Minute Meeting",
          slug: "30-min",
          durationMinutes: 30,
          description: "A quick 30 minute call.",
        },
      },
      availability: {
        create: [1, 2, 3, 4, 5].map((weekday) => ({
          weekday,
          startMinutes: 9 * 60,
          endMinutes: 17 * 60,
        })),
      },
    },
  });
  return finish(created);
}
