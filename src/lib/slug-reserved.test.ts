import { describe, it, expect } from "vitest";
import { slugify, isReservedSlug, RESERVED_SLUGS } from "@/lib/slug-reserved";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Demo Salon")).toBe("demo-salon");
  });

  it("strips punctuation and collapses separator runs", () => {
    expect(slugify("Anna's Hair & Beauty!!")).toBe("anna-s-hair-beauty");
  });

  it("trims leading and trailing separators", () => {
    expect(slugify("  --Hello World--  ")).toBe("hello-world");
  });

  it("drops non-ASCII characters", () => {
    // The public route and the reserved-word check both assume [a-z0-9-].
    expect(slugify("Café Münchén")).toBe("caf-m-nch-n");
    expect(slugify("日本語")).toBe("");
  });

  it("caps length at 60 characters", () => {
    expect(slugify("a".repeat(200))).toHaveLength(60);
  });

  it("never produces a slug containing a dot", () => {
    // Why "favicon.ico" and friends can't be claimed regardless of the
    // reserved list, and why the build-time route check only has to cover
    // dot-free segments.
    expect(slugify("favicon.ico")).toBe("favicon-ico");
    expect(slugify("robots.txt")).not.toContain(".");
  });
});

describe("isReservedSlug", () => {
  it("blocks slugs that collide with real top-level routes", () => {
    // Each of these is a real route; a tenant here would get a booking page
    // permanently shadowed by it. scripts/check-reserved-slugs.ts keeps this
    // list in sync with the route tree at build time.
    for (const word of ["dashboard", "admin", "api", "login", "signup", "booking", "recover"]) {
      expect(isReservedSlug(word)).toBe(true);
    }
  });

  it("blocks metadata-convention routes", () => {
    for (const word of ["icon", "apple-icon", "opengraph-image"]) {
      expect(isReservedSlug(word)).toBe(true);
    }
  });

  it("allows ordinary business handles", () => {
    for (const word of ["demo-salon", "anna-hair", "acme-clinic", "bookings-by-sam"]) {
      expect(isReservedSlug(word)).toBe(false);
    }
  });

  it("holds only slug-shaped entries, so every entry is actually reachable", () => {
    // A reserved word that slugify() could never produce is dead weight and
    // hides the fact that the real route isn't protected. The dotted entries
    // are the deliberate exception — see the slugify test above.
    for (const word of RESERVED_SLUGS) {
      if (word.includes(".")) continue;
      expect(slugify(word)).toBe(word);
    }
  });
});
