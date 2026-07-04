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
    return new Response(null, { status: 404 });
  }

  // Local dev: avatarUrl is a public path like /uploads/avatars/…
  if (user.avatarUrl.startsWith("/")) {
    return Response.redirect(user.avatarUrl, 302);
  }

  // Production: fetch the private blob server-side and stream it to the browser.
  try {
    const info = await head(user.avatarUrl);
    const upstream = await fetch(info.downloadUrl);
    if (!upstream.ok) return new Response(null, { status: 404 });

    return new Response(upstream.body, {
      headers: {
        "Content-Type": info.contentType ?? "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
