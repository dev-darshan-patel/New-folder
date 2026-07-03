import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRole } from "@/lib/admin-auth";

// Download all email templates as a JSON file (SUPER_ADMIN only).
export async function GET() {
  await requireAdminRole("SUPER_ADMIN");

  const rows = await prisma.emailTemplate.findMany({
    select: { key: true, category: true, name: true, subject: true, html: true, text: true, enabled: true },
    orderBy: { key: "asc" },
  });

  const body = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), templates: rows }, null, 2);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="email-templates.json"`,
    },
  });
}
