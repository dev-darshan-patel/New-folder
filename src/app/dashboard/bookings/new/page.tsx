import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import NewBookingForm from "../NewBookingForm";

export default async function NewBookingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const eventTypes = await prisma.eventType.findMany({
    where: { userId: user.id, active: true, assignmentMode: "SOLO" },
    select: { id: true, title: true, durationMinutes: true },
    orderBy: { title: "asc" },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">New booking</h1>
        <p className="mt-1 text-sm text-slate-600">
          Add a booking for a customer you took over the phone or in person.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/dashboard/bookings" className="text-indigo-600 hover:underline">
            ← Back to bookings
          </Link>
        </p>
      </div>

      <div className="mt-6">
        <NewBookingForm eventTypes={eventTypes} timezone={user.timezone} />
      </div>
    </div>
  );
}
