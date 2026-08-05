import fs from "node:fs";
import path from "node:path";
import { RESERVED_SLUGS } from "../src/lib/slug-reserved";

// Guards against the exact bug this script exists to prevent: a tenant's
// booking page living at bare /{slug}, so any real top-level route silently
// shadows any tenant unlucky enough to pick that word (Next.js always
// resolves a static segment before the dynamic [slug] catch-all — the
// tenant's page doesn't error, it just becomes permanently unreachable,
// with nothing telling anyone). RESERVED_SLUGS in src/lib/slug-reserved.ts is a
// manually-maintained list; this script is what keeps it honest by
// deriving the *actual* answer from the route tree on every build and
// failing loudly the moment they disagree, instead of shipping a silent
// dead page for whoever picks the missing word.
//
// Scope: only src/app's TOP-LEVEL segments matter. Everything a tenant can
// reach lives at /{slug} or /{slug}/{eventSlug} — one static top-level
// folder is enough to shadow *everything* under it, however deep, so there
// is no need to walk deeper than one level (route groups aside, handled
// below).

const APP_DIR = path.join(process.cwd(), "src", "app");

// Next.js "special file" conventions that occupy a slot in src/app but do
// NOT introduce a new URL segment of their own (they render the route the
// folder they're in already represents). Extension-stripped, lowercased.
const NON_SEGMENT_BASENAMES = new Set([
  "page",
  "layout",
  "loading",
  "error",
  "global-error",
  "not-found",
  "template",
  "default",
  "route",
  "globals",
]);

// Metadata file-convention basenames Next.js maps to a generated route at
// /{basename} (extension dropped) when the file exists directly under
// src/app. robots/sitemap/manifest/favicon keep their extension in the
// served path (e.g. /robots.txt) so a slugified tenant handle — which can
// never contain a dot — can't collide with those regardless; they're
// intentionally not included here for that reason.
const METADATA_ROUTE_BASENAMES = new Set(["icon", "apple-icon", "opengraph-image", "twitter-image"]);

function isRouteGroup(name: string): boolean {
  return name.startsWith("(") && name.endsWith(")");
}

function isDynamicSegment(name: string): boolean {
  return name.startsWith("[") && name.endsWith("]");
}

// Collects every top-level static URL segment src/app actually produces,
// transparently flattening route groups (their parens don't appear in the
// URL, so a route group's children compete for the SAME namespace as any
// other top-level folder).
function collectTopLevelSegments(dir: string): string[] {
  const segments: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (isRouteGroup(entry.name)) {
        segments.push(...collectTopLevelSegments(path.join(dir, entry.name)));
        continue;
      }
      if (isDynamicSegment(entry.name)) continue; // the [slug] catch-all itself
      segments.push(entry.name);
      continue;
    }
    const ext = path.extname(entry.name);
    const base = path.basename(entry.name, ext);
    if (NON_SEGMENT_BASENAMES.has(base)) continue;
    if (METADATA_ROUTE_BASENAMES.has(base)) {
      segments.push(base);
    }
    // Anything else (a random top-level file that isn't a recognized
    // convention) doesn't produce a route on its own — ignore it.
  }
  return segments;
}

const realSegments = Array.from(new Set(collectTopLevelSegments(APP_DIR))).sort();
const missing = realSegments.filter((seg) => !RESERVED_SLUGS.has(seg));

if (missing.length > 0) {
  console.error(
    `\n✖ ${missing.length} real route${missing.length === 1 ? "" : "s"} ` +
      `missing from RESERVED_SLUGS (src/lib/slug-reserved.ts):\n`,
  );
  for (const seg of missing) console.error(`   - ${seg}`);
  console.error(
    `\nA tenant could pick one of these as their booking-page slug and it would\n` +
      `be silently shadowed by the real route forever — no error, just a dead\n` +
      `page nobody notices until a customer complains. Add the word(s) above to\n` +
      `RESERVED_SLUGS and rebuild.\n`,
  );
  process.exit(1);
}

console.log(`✓ RESERVED_SLUGS covers all ${realSegments.length} real top-level routes.`);
