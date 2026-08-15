import { notFound } from "next/navigation";
import type { Metadata } from "next";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { PRODUCT_NAME } from "@/lib/brand";
import { resolveBranding } from "@/lib/branding";
import { Card, CardContent } from "@/components/ui/card";

// Public admission ticket. The `code` in the URL is the only auth — the same
// unguessable-token pattern as the booking manage page. No login. This is the
// artifact the attendee shows at the gate; Phase 2's scanner reads its QR.
//
// Phase 1 renders a clean default design. The tenant-uploaded artwork designer
// is Phase 4 and layers on top of this without changing the data model.

const getTicket = async (code: string) =>
  prisma.ticket.findUnique({
    where: { code },
    include: {
      session: true,
      booking: { include: { eventType: true, user: true } },
    },
  });

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const ticket = await getTicket(code);
  if (!ticket) return { title: PRODUCT_NAME };
  return {
    title: `Ticket · ${ticket.booking.eventType.title}`,
    // A ticket is private — never let it surface in search or link previews.
    robots: { index: false, follow: false },
  };
}

export default async function TicketPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ticket = await getTicket(code);
  if (!ticket) notFound();

  const { booking } = ticket;
  const { eventType, user } = booking;

  // The business's own booking-page accent, when their plan grants branding.
  const branding = await resolveBranding(user);
  const accent = branding.color;

  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: user.timezone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(ticket.session?.startTime ?? booking.startTime);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  // Encode the full ticket URL: a generic phone camera opens this page, and the
  // Phase 2 scanner pulls the code back out of it. Rendered on a white card so
  // there's always the contrast + quiet zone a gate scanner needs.
  const qrDataUrl = await QRCode.toDataURL(`${baseUrl}/ticket/${ticket.code}`, {
    width: 320,
    margin: 2,
    errorCorrectionLevel: "M",
  });

  const statusLabel =
    ticket.status === "CHECKED_IN"
      ? "Checked in"
      : ticket.status === "VOID"
        ? "Void"
        : "Valid";
  const statusColor =
    ticket.status === "CHECKED_IN"
      ? "text-blue-600"
      : ticket.status === "VOID"
        ? "text-red-600"
        : "text-green-600";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 py-10">
      <Card className="w-full overflow-hidden">
        {/* Header band in the business's accent color. */}
        <div className="px-6 py-5 text-white" style={{ backgroundColor: accent }}>
          <p className="text-xs font-medium uppercase tracking-wide opacity-90">Admission ticket</p>
          <h1 className="mt-1 text-xl font-bold leading-tight">{eventType.title}</h1>
          <p className="mt-0.5 text-sm opacity-90">{user.businessName}</p>
        </div>

        <CardContent className="space-y-5 p-6">
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- server-generated data-URI QR; next/image adds nothing for an inline data URL */}
            <img
              src={qrDataUrl}
              alt={`QR code for ticket ${ticket.serial}`}
              className="h-56 w-56 rounded-lg border border-border bg-white p-2"
            />
          </div>

          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Ticket no.</dt>
              <dd className="font-semibold text-foreground">#{ticket.serial}</dd>
            </div>
            {ticket.attendeeName ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Attendee</dt>
                <dd className="font-medium text-foreground">{ticket.attendeeName}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">When</dt>
              <dd className="text-right font-medium text-foreground">{when}</dd>
            </div>
            {eventType.locationDetail ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Where</dt>
                <dd className="text-right font-medium text-foreground">{eventType.locationDetail}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Status</dt>
              <dd className={`font-semibold ${statusColor}`}>{statusLabel}</dd>
            </div>
          </dl>

          <p className="border-t border-border pt-4 text-center text-xs text-muted-foreground">
            Show this QR code at the entrance. Keep the link private — anyone with it can use this
            ticket.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
