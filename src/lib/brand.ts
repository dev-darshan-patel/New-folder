// The product's accent color, in one place.
//
// This is deliberately a plain hex constant rather than a CSS variable: it is
// consumed in contexts that can't resolve CSS at all — the OG image and apple
// icon are rasterised server-side by Satori, and transactional email HTML has
// to inline real values for mail clients. So TypeScript is the source of truth
// and `--primary` in globals.css mirrors it.
//
// Keep this file free of server-only imports — client components
// (BookingWidget, Charts) import it too.
//
// Changing the brand color means updating this constant AND `--primary` in
// src/app/globals.css. It does NOT change existing tenants' saved brandColor,
// which is their own setting seeded from the Prisma default.
export const BRAND_COLOR = "#4f46e5";
