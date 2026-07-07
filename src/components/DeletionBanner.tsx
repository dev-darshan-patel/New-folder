import { getCurrentUser } from "@/lib/auth";
import { graceDeadline } from "@/lib/account-deletion";
import { cancelDeletionRequestAction } from "@/app/dashboard/settings/actions";

export default async function DeletionBanner() {
  const user = await getCurrentUser();
  if (!user?.deletionRequestedAt) return null;

  const deadline = graceDeadline(user.deletionRequestedAt);
  const when = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: user.timezone,
  }).format(deadline);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 bg-red-600 px-4 py-2 text-sm font-medium text-red-50">
      <span>
        This account is scheduled for deletion on {when}. Upcoming bookings and your
        subscription will be cancelled at that time.
      </span>
      <form action={cancelDeletionRequestAction}>
        <button
          type="submit"
          className="rounded-lg bg-red-950 px-3 py-1 text-xs font-semibold text-red-50 hover:bg-red-900"
        >
          Keep my account
        </button>
      </form>
    </div>
  );
}
