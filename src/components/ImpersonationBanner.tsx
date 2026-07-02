import { getImpersonator } from "@/lib/auth";
import { stopImpersonationAction } from "@/app/admin/actions";

export default async function ImpersonationBanner() {
  const admin = await getImpersonator();
  if (!admin) return null;

  return (
    <div className="flex items-center justify-between bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950">
      <span>
        Viewing as this account, impersonated by {admin.email}.
      </span>
      <form action={stopImpersonationAction}>
        <button
          type="submit"
          className="rounded-lg bg-amber-950 px-3 py-1 text-xs font-semibold text-amber-50 hover:bg-amber-900"
        >
          Stop impersonating
        </button>
      </form>
    </div>
  );
}
