import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import ResetPasswordForm from "./ResetPasswordForm";

function isTokenValid(expiresAt: Date | null, now: number): boolean {
  return !!expiresAt && expiresAt.getTime() > now;
}

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const now = new Date().getTime();

  const user = await prisma.user.findUnique({ where: { passwordResetToken: token } });
  if (!user) notFound();
  const valid = isTokenValid(user.passwordResetExpiresAt, now);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Set a new password</h1>
      {valid ? (
        <>
          <p className="mt-2 text-sm text-slate-600">
            Choose a new password for {user.email}.
          </p>
          <ResetPasswordForm token={token} />
        </>
      ) : (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          This reset link is invalid or has expired. Request a new one from the{" "}
          <Link href="/forgot-password" className="font-medium underline">
            forgot-password page
          </Link>
          .
        </p>
      )}
    </div>
  );
}
