import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  parseBookingsQuery,
  buildBookingWhere,
  buildBookingOrderBy,
} from "@/lib/admin-bookings-query";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.adminRole) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = parseBookingsQuery(sp);
  const where = buildBookingWhere(parsed);
  const orderBy = buildBookingOrderBy(parsed);

  const bookings = await prisma.booking.findMany({
    where,
    orderBy,
    include: { eventType: true, user: { select: { businessName: true } } },
  });

  const header = [
    "When",
    "Business",
    "Event Type",
    "Invitee Name",
    "Invitee Email",
    "Status",
    "Reschedule Count",
    "Created",
  ];
  const rows = bookings.map((b) =>
    [
      b.startTime.toISOString(),
      b.user.businessName,
      b.eventType.title,
      b.inviteeName,
      b.inviteeEmail,
      b.status,
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
