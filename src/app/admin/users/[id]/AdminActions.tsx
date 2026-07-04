import type { AdminRole, User } from "@prisma/client";
import {
  changeUserPlanAction,
  forcePasswordResetAction,
  setSuspendedAction,
  softDeleteUserAction,
  restoreUserAction,
  startImpersonationAction,
  setAdminRoleAction,
} from "../../actions";
import HardDeleteForm from "./HardDeleteForm";

const ROLES: AdminRole[] = ["SUPER_ADMIN", "SUPPORT", "READ_ONLY"];

export default function AdminActions({
  target,
  viewerRole,
  isSelf,
  plans,
}: {
  target: User;
  viewerRole: AdminRole;
  isSelf: boolean;
  plans: { id: string; name: string }[];
}) {
  const isSuperAdmin = viewerRole === "SUPER_ADMIN";
  const canMutate = viewerRole !== "READ_ONLY";

  if (!canMutate) {
    return (
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Admin actions
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Your role (Read Only) can view this account but can&apos;t make changes.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Admin actions
      </h2>

      {/* Change plan */}
      <div>
        <p className="text-sm font-medium text-slate-700">Change plan</p>
        <form action={changeUserPlanAction} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="userId" value={target.id} />
          <select
            name="plan"
            defaultValue={target.plan}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-500"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            name="reason"
            placeholder="Reason (optional)"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-500"
          />
          <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
            Apply
          </button>
        </form>
      </div>

      {/* Password reset */}
      <div>
        <p className="text-sm font-medium text-slate-700">Account access</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <form action={forcePasswordResetAction}>
            <input type="hidden" name="userId" value={target.id} />
            <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Send password reset email
            </button>
          </form>

          <form action={setSuspendedAction}>
            <input type="hidden" name="userId" value={target.id} />
            <input type="hidden" name="suspended" value={target.suspended ? "0" : "1"} />
            <button
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                target.suspended
                  ? "border border-green-300 text-green-700 hover:bg-green-50"
                  : "border border-amber-300 text-amber-700 hover:bg-amber-50"
              }`}
            >
              {target.suspended ? "Unsuspend account" : "Suspend account"}
            </button>
          </form>

          {isSuperAdmin && !isSelf && (
            <form action={startImpersonationAction}>
              <input type="hidden" name="userId" value={target.id} />
              <button
                disabled={target.suspended || !!target.deletedAt}
                className="rounded-lg border border-indigo-300 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                View as this user
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Admin role (super admin only) */}
      {isSuperAdmin && (
        <div>
          <p className="text-sm font-medium text-slate-700">Admin role</p>
          <form action={setAdminRoleAction} className="mt-2 flex items-center gap-2">
            <input type="hidden" name="userId" value={target.id} />
            <select
              name="role"
              defaultValue={target.adminRole ?? ""}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 outline-none focus:border-indigo-500"
            >
              <option value="">Not an admin</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.replace("_", " ")}
                </option>
              ))}
            </select>
            <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
              Save role
            </button>
          </form>
        </div>
      )}

      {/* Soft delete / restore + hard delete (super admin only) */}
      {isSuperAdmin && (
        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm font-medium text-red-700">Danger zone</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {target.deletedAt ? (
              <form action={restoreUserAction}>
                <input type="hidden" name="userId" value={target.id} />
                <button className="rounded-lg border border-green-300 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50">
                  Restore account
                </button>
              </form>
            ) : (
              <form action={softDeleteUserAction}>
                <input type="hidden" name="userId" value={target.id} />
                <button className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
                  Soft delete (hide account)
                </button>
              </form>
            )}
          </div>
          <div className="mt-3">
            <HardDeleteForm userId={target.id} slug={target.slug} />
          </div>
        </div>
      )}
    </div>
  );
}
