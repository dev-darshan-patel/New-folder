import { getImpersonator } from "@/lib/auth";
import { stopImpersonationAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";

export default async function ImpersonationBanner() {
  const admin = await getImpersonator();
  if (!admin) return null;

  return (
    <div className="flex items-center justify-between bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950">
      <span>
        Viewing as this account, impersonated by {admin.email}.
      </span>
      <form action={stopImpersonationAction}>
        <Button
          type="submit"
          size="sm"
          className="bg-amber-950 text-amber-50 hover:bg-amber-900"
        >
          Stop impersonating
        </Button>
      </form>
    </div>
  );
}
