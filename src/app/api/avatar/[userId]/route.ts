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

  // Local dev: avatarUrl is already a public path, redirect directly.
  if (user.avatarUrl.startsWith("/")) {
    return Response.redirect(user.avatarUrl, 302);
  }

  // Production: get a fresh signed download URL from Vercel Blob.
  try {
    const info = await head(user.avatarUrl);
    return Response.redirect(info.downloadUrl, 302);
  } catch {
    return new Response(null, { status: 404 });
  }
}
