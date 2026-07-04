import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import ProfileForm from "./ProfileForm";
import PasswordForm from "./PasswordForm";
import AvatarUpload from "@/components/AvatarUpload";

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

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
            currentUrl={user.avatarUrl ? `/api/avatar/${user.id}` : null}
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
