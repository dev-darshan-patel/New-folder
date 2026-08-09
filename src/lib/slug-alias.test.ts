import { describe, it, expect } from "vitest";

// The DB-backed behaviour of resolveSlug / isSlugTakenByAnother / renameUserSlug
// is covered by the end-to-end verification recorded in the commit rather than
// here, since it needs a real database. What's unit-testable is the redirect
// *decision* the public routes make from resolveSlug's result — specifically
// the guard that stops a live tenant with a missing event type from being
// redirected to the URL it's already on.

// Mirrors the condition in src/app/[slug]/[eventSlug]/page.tsx.
function shouldRedirect(requested: string, resolved: string | null): boolean {
  return Boolean(resolved && resolved !== requested);
}

describe("alias redirect decision", () => {
  it("redirects when the handle has been renamed away", () => {
    expect(shouldRedirect("old-handle", "new-handle")).toBe(true);
  });

  it("does not redirect when nothing owns the handle", () => {
    // Nobody has it — the route should 404, not bounce.
    expect(shouldRedirect("never-existed", null)).toBe(false);
  });

  it("does not redirect when the handle is already current", () => {
    // The case that would loop forever: getEventTypeForBooking also returns
    // null for a LIVE tenant whose event type is missing or inactive, and
    // resolveSlug hands back the same handle. Redirecting there would send the
    // browser to the URL it just asked for, over and over.
    expect(shouldRedirect("demo-salon", "demo-salon")).toBe(false);
  });
});
