import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BroadcastForm } from "./BroadcastForm";

export default async function AdminBroadcastPage() {
  const viewer = await getCurrentUser();
  if (!viewer || !viewer.adminRole) {
    return null;
  }

  if (viewer.adminRole !== "SUPER_ADMIN") {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Broadcast email</h1>
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Only super admins can send broadcast emails.
        </p>
      </div>
    );
  }

  const recipientCount = await prisma.user.count({
    where: { deletedAt: null, suspended: false },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Broadcast email</h1>
      <p className="mt-1 text-sm text-slate-600">
        Send an email to every active business on the platform. This will email{" "}
        <strong>{recipientCount}</strong> {recipientCount === 1 ? "business" : "businesses"}.
      </p>

      <BroadcastForm recipientCount={recipientCount} />
    </div>
  );
}
