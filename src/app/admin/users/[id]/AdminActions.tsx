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
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
      <Card className="mt-6">
        <CardContent className="p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Admin actions
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Your role (Read Only) can view this account but can&apos;t make changes.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardContent className="space-y-6 p-5">
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
          <Button size="sm">Apply</Button>
        </form>
      </div>

      {/* Password reset */}
      <div>
        <p className="text-sm font-medium text-slate-700">Account access</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <form action={forcePasswordResetAction}>
            <input type="hidden" name="userId" value={target.id} />
            <Button type="submit" variant="outline" size="sm">
              Send password reset email
            </Button>
          </form>

          {/* Restoring access is safe and instant, so it stays a plain button.
              Suspending is customer-visible — it blocks the tenant's login AND
              404s their public booking page — so it asks first. */}
          {target.suspended ? (
            <form action={setSuspendedAction}>
              <input type="hidden" name="userId" value={target.id} />
              <input type="hidden" name="suspended" value="0" />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className="border-green-300 text-green-700 hover:bg-green-50"
              >
                Unsuspend account
              </Button>
            </form>
          ) : (
            <ConfirmSubmit
              action={setSuspendedAction}
              fields={{ userId: target.id, suspended: "1" }}
              label="Suspend account"
              className="border border-amber-300 text-amber-700 hover:bg-amber-50"
              title={`Suspend ${target.businessName}?`}
              confirmLabel="Suspend account"
              description="They will be signed out and unable to log back in, and their public booking page will stop accepting bookings immediately. Existing bookings are kept. You can undo this at any time."
            />
          )}

          {isSuperAdmin && !isSelf && (
            <form action={startImpersonationAction}>
              <input type="hidden" name="userId" value={target.id} />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={target.suspended || !!target.deletedAt}
                className="border-primary/30 text-primary hover:bg-primary/5"
              >
                View as this user
              </Button>
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
            <Button size="sm">Save role</Button>
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
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="border-green-300 text-green-700 hover:bg-green-50"
                >
                  Restore account
                </Button>
              </form>
            ) : (
              <ConfirmSubmit
                action={softDeleteUserAction}
                fields={{ userId: target.id }}
                label="Soft delete (hide account)"
                className="border border-red-300 text-red-700 hover:bg-red-50"
                title={`Soft delete ${target.businessName}?`}
                confirmLabel="Soft delete"
                description="The account is hidden from the users list and can no longer be used, but nothing is erased — you can restore it from this page at any time."
              />
            )}
          </div>
          <div className="mt-3">
            <HardDeleteForm userId={target.id} slug={target.slug} />
          </div>
        </div>
      )}
      </CardContent>
    </Card>
  );
}
