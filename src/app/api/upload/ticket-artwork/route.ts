import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyCsrfOrigin } from "@/lib/csrf";
import { getStorageProvider } from "@/lib/storage";
import { validateImageUpload, extensionForImageType } from "@/lib/image-upload";
import { planHasFeature } from "@/lib/plans";
import { serializeTicketLayout, DEFAULT_TICKET_LAYOUT } from "@/lib/ticket-template";
import logger from "@/lib/logger";

// Ticket artwork is a full-bleed background someone will look at up close (and
// possibly print), so it gets a larger cap than a small round avatar.
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

// Upload / remove the background artwork for one event type's tickets.
// Ownership is enforced by scoping every query with userId — the eventTypeId
// arrives from the client and is never trusted on its own.
export async function POST(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return Response.json({ error: "Invalid origin." }, { status: 403 });
    }
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Uploading artwork CREATES a newly-gated thing, so unlike rendering
    // (which degrades gracefully for a downgraded tenant) this is refused
    // outright without the entitlement.
    if (!(await planHasFeature(user.plan, "ticket_designer"))) {
      return Response.json(
        { error: "The ticket designer isn't available on your current plan." },
        { status: 403 },
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const eventTypeId = String(formData.get("eventTypeId") || "");
    if (!file) return Response.json({ error: "No file provided." }, { status: 400 });
    if (!eventTypeId) return Response.json({ error: "Missing event type." }, { status: 400 });

    const eventType = await prisma.eventType.findFirst({
      where: { id: eventTypeId, userId: user.id },
      select: { id: true, ticketArtworkUrl: true, ticketLayout: true, issuesTickets: true },
    });
    if (!eventType) return Response.json({ error: "Event type not found." }, { status: 404 });
    if (!eventType.issuesTickets) {
      return Response.json(
        { error: "Turn on ticketing for this event type first." },
        { status: 400 },
      );
    }

    const validated = await validateImageUpload(file, MAX_BYTES);
    if (!validated.ok) {
      return Response.json({ error: validated.error }, { status: validated.status });
    }
    const { bytes: fileBytes, type: detectedType } = validated;

    const ext = extensionForImageType(detectedType);
    const filename = `${eventType.id}-${Date.now()}.${ext}`;

    let url: string;
    const storage = await getStorageProvider();
    try {
      const result = await storage.put(
        `ticket-artwork/${filename}`,
        Buffer.from(fileBytes),
        detectedType,
      );
      url = result.url;
    } catch (storageErr) {
      const msg = storageErr instanceof Error ? storageErr.message : String(storageErr);
      return Response.json({ error: `Storage not configured: ${msg}` }, { status: 503 });
    }

    // First artwork for this event type seeds a sensible starting layout so
    // the designer opens with a real ticket to rearrange instead of a blank
    // canvas. A re-upload keeps whatever layout the tenant already arranged —
    // swapping the background shouldn't throw away their positioning work.
    const layout = eventType.ticketLayout ?? serializeTicketLayout(DEFAULT_TICKET_LAYOUT);

    await prisma.eventType.update({
      where: { id: eventType.id },
      data: { ticketArtworkUrl: url, ticketLayout: layout },
    });

    // Clean up the replaced object so re-uploads don't accumulate forever.
    if (eventType.ticketArtworkUrl && eventType.ticketArtworkUrl !== url) {
      try {
        await storage.delete(eventType.ticketArtworkUrl);
      } catch (err) {
        logger.error(
          { err, eventTypeId: eventType.id },
          "Failed to delete previous ticket artwork during replace",
        );
      }
    }

    return Response.json({ url, layout });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Ticket artwork upload error");
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!verifyCsrfOrigin(req)) {
      return Response.json({ error: "Invalid origin." }, { status: 403 });
    }
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const eventTypeId = String(searchParams.get("eventTypeId") || "");
    if (!eventTypeId) return Response.json({ error: "Missing event type." }, { status: 400 });

    // No plan gate on removal: a downgraded tenant must always be able to
    // take their artwork back off, even once they can no longer add new.
    const eventType = await prisma.eventType.findFirst({
      where: { id: eventTypeId, userId: user.id },
      select: { id: true, ticketArtworkUrl: true },
    });
    if (!eventType) return Response.json({ error: "Event type not found." }, { status: 404 });

    // Clear the layout alongside the artwork — field positions are meaningless
    // without the background they were placed on, and keeping them would make
    // a later re-upload restore a stale arrangement.
    await prisma.eventType.update({
      where: { id: eventType.id },
      data: { ticketArtworkUrl: null, ticketLayout: null },
    });

    if (eventType.ticketArtworkUrl) {
      try {
        const storage = await getStorageProvider();
        await storage.delete(eventType.ticketArtworkUrl);
      } catch (err) {
        logger.error(
          { err, eventTypeId: eventType.id },
          "Failed to delete ticket artwork object",
        );
      }
    }
    return Response.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Ticket artwork delete error");
    return Response.json({ error: msg }, { status: 500 });
  }
}
