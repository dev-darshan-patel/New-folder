import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { planConfig } from "@/lib/plans";
import { parseUsersQuery, buildUserWhere, buildUserOrderBy } from "@/lib/admin-users-query";

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
  const parsed = parseUsersQuery(sp);
  const where = buildUserWhere(parsed);
  const orderBy = buildUserOrderBy(parsed);

  const users = await prisma.user.findMany({
    where,
    orderBy,
    include: { _count: { select: { eventTypes: true, bookings: true } } },
  });

  const header = ["Business", "Email", "Slug", "Plan", "Event Types", "Bookings", "Joined"];
  const rows = users.map((u) =>
    [
      u.businessName,
      u.email,
      u.slug,
      planConfig(u.plan).name,
      String(u._count.eventTypes),
      String(u._count.bookings),
      u.mobile ?? "",
      u.subscriptionStatus ?? "",
      u.createdAt.toISOString().slice(0, 10),
    ]
      .map(csvEscape)
      .join(","),
  );
  const header2 = [...header.slice(0, 6), "Phone", "Subscription", header[6]];
  const csv = [header2.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="users-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
