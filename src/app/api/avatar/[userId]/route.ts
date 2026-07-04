// This route is no longer used — avatars are stored in a public Vercel Blob
// store and served directly via CDN URL. Kept as a 404 stub so any old
// URLs stored in the DB don't cause unhandled 500s.
export async function GET() {
  return new Response(null, { status: 404 });
}
