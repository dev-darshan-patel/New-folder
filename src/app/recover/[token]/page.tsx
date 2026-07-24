import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { recoverAccountAction } from "./actions";
import { Button } from "@/components/ui/button";

export default async function RecoverAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const { error } = await searchParams;

  const user = await prisma.user.findUnique({ where: { recoveryToken: token } });
  if (!user) notFound();

  // Valid while the account is soft-deleted and still inside the purge window.
  // Date.now() is safe here: a server component renders once per request, so
  // there's no re-render nondeterminism the purity rule guards against.
  // eslint-disable-next-line react-hooks/purity
  const valid = !!user.deletedAt && (!user.purgeScheduledAt || user.purgeScheduledAt.getTime() > Date.now());

  const recoverWithToken = recoverAccountAction.bind(null, token);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Restore your account</h1>
      {error === "invalid" && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          This recovery link is invalid or has expired.
        </p>
      )}
      {valid ? (
        <>
          <p className="mt-2 text-sm text-slate-600">
            Restore the account for <span className="font-medium">{user.email}</span>. Your
            public booking page will come back online, but any bookings and subscription
            cancelled during deactivation stay cancelled.
          </p>
          <form action={recoverWithToken} className="mt-5">
            <Button type="submit" className="w-full">
              Restore my account
            </Button>
          </form>
        </>
      ) : (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          This recovery link is invalid or has expired. The account may have already been
          permanently deleted.{" "}
          <Link href="/signup" className="font-medium underline">
            Sign up again
          </Link>
          .
        </p>
      )}
    </div>
  );
}
