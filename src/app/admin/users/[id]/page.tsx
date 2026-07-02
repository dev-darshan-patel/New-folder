import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { planConfig } from "@/lib/plans";
import { addAdminNoteAction } from "../../actions";
import AdminActions from "./AdminActions";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BOOKINGS_PAGE_SIZE = 10;

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export default async function AdminUserDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ bpage?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const bookingPage = Math.max(1, Number(sp.bpage) || 1);

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      eventTypes: { orderBy: { createdAt: "asc" } },
      availability: { orderBy: [{ weekday: "asc" }, { startMinutes: "asc" }] },
      adminNotes: { orderBy: { createdAt: "desc" } },
      _count: { select: { bookings: true } },
    },
  });
  if (!user) notFound();

  const viewer = await getCurrentUser();
  if (!viewer || !viewer.adminRole) notFound();

  const [upcoming, totalBookings, bookings] = await Promise.all([
    prisma.booking.count({
      where: { userId: user.id, status: "CONFIRMED", startTime: { gte: new Date() } },
    }),
    prisma.booking.count({ where: { userId: user.id } }),
    prisma.booking.findMany({
      where: { userId: user.id },
      orderBy: { startTime: "desc" },
      skip: (bookingPage - 1) * BOOKINGS_PAGE_SIZE,
      take: BOOKINGS_PAGE_SIZE,
      include: { eventType: true },
    }),
  ]);

  const totalBookingPages = Math.max(1, Math.ceil(totalBookings / BOOKINGS_PAGE_SIZE));

  const availByDay = new Map<number, { start: number; end: number }>();
  for (const a of user.availability) {
    if (!availByDay.has(a.weekday)) availByDay.set(a.weekday, { start: a.startMinutes, end: a.endMinutes });
  }

  const stripeUrl = user.stripeCustomerId
    ? `https://dashboard.stripe.com/test/customers/${user.stripeCustomerId}`
    : null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/users" className="text-sm font-medium text-slate-500 hover:text-slate-900">
        ← All users
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{user.businessName}</h1>
          {viewer.adminRole === "SUPER_ADMIN" && (
            <Link
              href={`/admin/users/${user.id}/edit`}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Edit
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          {user.deletedAt && (
            <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
              Deleted
            </span>
          )}
          {user.suspended && !user.deletedAt && (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700">
              Suspended
            </span>
          )}
          {user.adminRole && (
            <span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-medium text-white">
              {user.adminRole.replace("_", " ")}
            </span>
          )}
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              user.plan === "FREE" ? "bg-slate-100 text-slate-600" : "bg-indigo-100 text-indigo-700"
            }`}
          >
            {planConfig(user.plan).name} · ${planConfig(user.plan).priceMonthly}/mo
          </span>
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        {user.email} · {user.name} · joined {user.createdAt.toLocaleDateString()}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        Subscription status: {user.subscriptionStatus ?? "—"}
        {user.planRenewsAt ? ` · renews ${user.planRenewsAt.toLocaleDateString()}` : ""}
        {stripeUrl && (
          <>
            {" · "}
            <a href={stripeUrl} target="_blank" className="text-indigo-600 hover:underline">
              View in Stripe ↗
            </a>
          </>
        )}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Mini label="Booking link" value={`/${user.slug}`} />
        <Mini label="Total bookings" value={String(user._count.bookings)} />
        <Mini label="Upcoming" value={String(upcoming)} />
      </div>

      {/* Branding preview */}
      <Section title="Branding">
        <div className="flex items-center gap-4 py-2">
          {user.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.logoUrl} alt="" className="h-10 w-auto object-contain" />
          ) : (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ backgroundColor: user.brandColor }}
            >
              {user.businessName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="text-sm">
            <p className="font-medium text-slate-800" style={{ color: user.brandColor }}>
              {user.brandColor} · {user.brandFont}
            </p>
            {user.welcomeMessage && <p className="text-slate-500">“{user.welcomeMessage}”</p>}
          </div>
        </div>
      </Section>

      {/* Availability summary */}
      <Section title="Weekly availability">
        <div className="grid grid-cols-7 gap-1 py-2 text-center text-xs">
          {DAYS.map((d, i) => {
            const w = availByDay.get(i);
            return (
              <div
                key={d}
                className={`rounded-lg px-1 py-2 ${w ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-300"}`}
              >
                <div className="font-semibold">{d}</div>
                <div className="mt-1">{w ? `${toHHMM(w.start)}–${toHHMM(w.end)}` : "off"}</div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Event types */}
      <Section title={`Event types (${user.eventTypes.length})`}>
        <NoteList>
          {user.eventTypes.map((et) => (
            <li key={et.id} className="flex justify-between py-2 text-sm">
              <span className="text-slate-800">{et.title}</span>
              <span className="text-slate-400">
                {et.durationMinutes} min{et.active ? "" : " · inactive"}
              </span>
            </li>
          ))}
        </NoteList>
      </Section>

      {/* Booking history / activity timeline */}
      <Section title="Booking activity">
        <NoteList>
          {bookings.map((b) => (
            <li key={b.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
              <span className="text-slate-800">
                {b.inviteeName} · {b.eventType.title}
              </span>
              <span className="text-slate-400">
                {b.startTime.toLocaleString()}
                {b.status === "CANCELLED" ? " · canceled" : ""}
              </span>
            </li>
          ))}
          {bookings.length === 0 && <li className="py-2 text-sm text-slate-400">No bookings yet.</li>}
        </NoteList>
        {totalBookingPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-sm text-slate-500">
            <span>
              Page {bookingPage} of {totalBookingPages}
            </span>
            <div className="flex gap-2">
              <Link
                href={`/admin/users/${id}?bpage=${Math.max(1, bookingPage - 1)}`}
                className="rounded-lg border border-slate-300 px-3 py-1 hover:bg-slate-50"
              >
                ← Prev
              </Link>
              <Link
                href={`/admin/users/${id}?bpage=${Math.min(totalBookingPages, bookingPage + 1)}`}
                className="rounded-lg border border-slate-300 px-3 py-1 hover:bg-slate-50"
              >
                Next →
              </Link>
            </div>
          </div>
        )}
      </Section>

      {/* Internal notes */}
      <Section title="Internal notes">
        <div className="space-y-3 py-2">
          {user.adminNotes.map((n) => (
            <div key={n.id} className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="text-slate-700">{n.body}</p>
              <p className="mt-1 text-xs text-slate-400">
                {n.authorEmail} · {n.createdAt.toLocaleString()}
              </p>
            </div>
          ))}
          {user.adminNotes.length === 0 && (
            <p className="text-sm text-slate-400">No notes yet.</p>
          )}
        </div>
        {viewer.adminRole === "READ_ONLY" ? (
          <p className="pt-2 text-xs text-slate-400">
            Read-only access — you can&apos;t add notes.
          </p>
        ) : (
          <form action={addAdminNoteAction} className="flex items-start gap-2 pt-2">
            <input type="hidden" name="userId" value={user.id} />
            <textarea
              name="body"
              rows={2}
              required
              placeholder="Add an internal note (not visible to the user)…"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Add
            </button>
          </form>
        )}
      </Section>

      <AdminActions target={user} viewerRole={viewer.adminRole} isSelf={viewer.id === user.id} />
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 truncate font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

function NoteList({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-slate-100">{children}</ul>;
}
