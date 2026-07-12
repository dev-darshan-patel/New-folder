import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { renderTemplate } from "@/lib/email-templates";
import logger from "@/lib/logger";

function isExpired(expiresAt: Date | null): boolean {
  return !expiresAt || expiresAt.getTime() < Date.now();
}

// Visiting the link IS the confirmation, so the mutation happens right here in
// the server component — same token-page pattern as /reset-password/[token].
export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const user = await prisma.user.findUnique({ where: { emailVerifyToken: token } });
  if (!user) notFound();

  const expired = isExpired(user.emailVerifyExpiresAt);

  if (!expired) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerifyToken: null,
        emailVerifyExpiresAt: null,
      },
    });

    // Welcome email, sent once (the token is cleared above so a re-visit 404s).
    // Only for first-time verification, not re-verifications of an already-set
    // address.
    if (!user.emailVerifiedAt) {
      const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      try {
        const mail = await renderTemplate("account.welcome", {
          user_name: user.name,
          login_url: `${base}/dashboard`,
        });
        await sendEmail({ to: user.email, ...mail });
      } catch (err) {
        logger.error({ err, userId: user.id }, "Failed to send welcome email");
      }
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Email verification
      </h1>
      {expired ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          This link has expired. Sign in and use the resend button on your
          dashboard to get a fresh one.
        </p>
      ) : (
        <>
          <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            Your email address has been verified. You&apos;re all set!
          </p>
          <p className="mt-4 text-sm text-slate-600">
            <Link href="/dashboard" className="font-medium text-indigo-600 underline">
              Go to your dashboard
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
