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

  // Production: fetch the private blob using the token as a Bearer credential.
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return Response.json({ error: "BLOB_READ_WRITE_TOKEN not set" }, { status: 503 });
  }

  try {
    const upstream = await fetch(user.avatarUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!upstream.ok) {
      return Response.json(
        { error: `blob fetch failed: ${upstream.status}`, url: user.avatarUrl },
        { status: 502 },
      );
    }

    const contentType = upstream.headers.get("Content-Type") ?? "image/jpeg";
    return new Response(upstream.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Avatar proxy error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
