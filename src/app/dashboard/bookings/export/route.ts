import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { planHasFeature } from "@/lib/plans";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

// Export the signed-in tenant's OWN bookings as CSV. Scoped to userId — never
// crosses tenant boundaries (unlike the admin export at /admin/bookings/export).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!(await planHasFeature(user.plan, "csv_export"))) {
    return NextResponse.json({ error: "CSV export isn't available on your current plan." }, { status: 403 });
  }

  const bookings = await prisma.booking.findMany({
    where: { userId: user.id },
    orderBy: { startTime: "desc" },
    include: { eventType: { select: { title: true } }, teamMember: { select: { name: true } } },
  });

  const header = [
    "When",
    "Event Type",
    "Invitee Name",
    "Invitee Email",
    "Status",
    "With",
    "Meeting URL",
    "Series",
    "Notes",
    "Reschedule Count",
    "Created",
  ];
  const rows = bookings.map((b) =>
    [
      b.startTime.toISOString(),
      b.eventType.title,
      b.inviteeName,
      b.inviteeEmail,
      b.status,
      b.teamMember?.name ?? "",
      b.meetingUrl ?? "",
      b.seriesId ? `${b.seriesIndex}/${b.seriesTotal}` : "",
      b.notes ?? "",
      String(b.rescheduleCount),
      b.createdAt.toISOString(),
    ]
      .map(csvEscape)
      .join(","),
  );
  const csv = [header.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bookings-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
