import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import CreateUserForm from "./CreateUserForm";

export default async function NewUserPage() {
  try {
    await requireAdminRole("SUPER_ADMIN");
  } catch {
    redirect("/admin/users");
  }
  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create user</h1>
        <Link
          href="/admin/users"
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          ← Back to users
        </Link>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Create a new business account. The user can change their password from account settings.
      </p>
      <CreateUserForm />
    </div>
  );
}
