import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import EditUserForm from "./EditUserForm";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await getCurrentUser();
  if (!viewer || !viewer.adminRole) notFound();

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      businessName: true,
      email: true,
      slug: true,
      timezone: true,
      mobile: true,
    },
  });
  if (!user) notFound();

  if (viewer.adminRole !== "SUPER_ADMIN") {
    redirect(`/admin/users/${id}`);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Edit user</h1>
        <Link
          href={`/admin/users/${id}`}
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← Back to user
        </Link>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Edit the account&apos;s core details. Plan, role, and access controls have their own actions on the detail page.
      </p>
      <EditUserForm
        initial={{
          id: user.id,
          name: user.name,
          businessName: user.businessName,
          email: user.email,
          slug: user.slug,
          timezone: user.timezone,
          mobile: user.mobile ?? "",
        }}
      />
    </div>
  );
}
