import { head } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true },
  });

  if (!user?.avatarUrl) {
    return Response.json({ error: "no avatarUrl in DB" }, { status: 404 });
  }

  // Local dev: avatarUrl is a public path like /uploads/avatars/…
  if (user.avatarUrl.startsWith("/")) {
    return Response.redirect(user.avatarUrl, 302);
  }

  // Production: fetch the private blob server-side and stream to the browser.
  try {
    const info = await head(user.avatarUrl);
    const upstream = await fetch(info.downloadUrl);
    if (!upstream.ok) {
      return Response.json(
        { error: `upstream fetch failed: ${upstream.status} ${upstream.statusText}`, downloadUrl: info.downloadUrl },
        { status: 502 },
      );
    }
    return new Response(upstream.body, {
      headers: {
        "Content-Type": info.contentType ?? "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Avatar proxy error:", msg);
    return Response.json({ error: msg, avatarUrl: user.avatarUrl }, { status: 500 });
  }
}
