import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getCalendarConnection, isCalendarConfigurable } from "@/lib/google-calendar";
import ProfileForm from "./ProfileForm";
import PasswordForm from "./PasswordForm";
import AvatarUpload from "@/components/AvatarUpload";
import { disconnectCalendarAction } from "./actions";

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const CALENDAR_STATUS: Record<string, { text: string; tone: "ok" | "err" }> = {
  connected: { text: "Google Calendar connected. Google Meet event types will now generate links automatically.", tone: "ok" },
  denied: { text: "Calendar connection was cancelled.", tone: "err" },
  error: { text: "Couldn't connect your calendar. Please try again.", tone: "err" },
  not_configured: { text: "Google sign-in isn't configured on this platform yet. Ask the admin to set it up.", tone: "err" },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const [connection, calendarConfigurable, sp] = await Promise.all([
    getCalendarConnection(user.id),
    isCalendarConfigurable(),
    searchParams,
  ]);
  const calendarStatus = sp.calendar ? CALENDAR_STATUS[sp.calendar] : null;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Account settings</h1>
        <p className="mt-1 text-sm text-slate-600">Manage your profile and password.</p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">Profile</h2>
        <p className="mt-1 text-xs text-slate-500">
          Your email is{" "}
          <span className="font-medium text-slate-700">{user.email}</span>.
        </p>

        <div className="mt-5 border-b border-slate-100 pb-6">
          <AvatarUpload
            currentUrl={user.avatarUrl ?? null}
            initials={initials(user.name)}
          />
        </div>

        <ProfileForm
          initial={{
            name: user.name,
            businessName: user.businessName,
            mobile: user.mobile,
            slug: user.slug,
            timezone: user.timezone,
          }}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">Password</h2>
        <PasswordForm hasPassword={Boolean(user.passwordHash)} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">Integrations</h2>
        <p className="mt-1 text-sm text-slate-600">
          Connect Google Calendar to auto-generate a Google Meet link for online
          event types and add each booking to your calendar.
        </p>

        {calendarStatus && (
          <p
            className={`mt-4 rounded-lg px-3 py-2 text-sm ${
              calendarStatus.tone === "ok"
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {calendarStatus.text}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg">
              📅
            </span>
            <div>
              <p className="text-sm font-medium text-slate-800">Google Calendar</p>
              {connection ? (
                <p className="text-xs text-green-600">
                  Connected{connection.accountEmail ? ` — ${connection.accountEmail}` : ""}
                </p>
              ) : (
                <p className="text-xs text-slate-500">Not connected</p>
              )}
            </div>
          </div>

          {connection ? (
            <form action={disconnectCalendarAction}>
              <button
                type="submit"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Disconnect
              </button>
            </form>
          ) : calendarConfigurable ? (
            <a
              href="/api/calendar/google/start"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              Connect
            </a>
          ) : (
            <span className="text-xs text-slate-400">Unavailable</span>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">Two-factor authentication</h2>
        <p className="mt-1 text-sm text-slate-600">
          {user.totpEnabled
            ? "2FA is enabled on your account."
            : "Add an extra layer of security to every sign-in."}
        </p>
        <Link
          href="/dashboard/settings/security"
          className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:underline"
        >
          {user.totpEnabled ? "Manage 2FA →" : "Enable 2FA →"}
        </Link>
      </section>
    </div>
  );
}
