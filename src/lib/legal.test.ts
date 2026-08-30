import { describe, it, expect } from "vitest";
import { parseLegalContent, STARTER_TERMS, STARTER_PRIVACY } from "@/lib/legal";

// This renderer shows a published legal agreement. Its one hard requirement is
// that it must never silently drop content — a missing clause in a policy is a
// genuinely bad failure, so unrecognised input has to degrade to a paragraph
// rather than vanish.

describe("parseLegalContent", () => {
  it("renders headings, paragraphs and lists", () => {
    const blocks = parseLegalContent("## Title\nSome text.\n- one\n- two\n### Sub\nMore.");
    expect(blocks).toEqual([
      { type: "h2", text: "Title" },
      { type: "p", text: "Some text." },
      { type: "ul", items: ["one", "two"] },
      { type: "h3", text: "Sub" },
      { type: "p", text: "More." },
    ]);
  });

  it("treats unrecognised syntax as a paragraph rather than dropping it", () => {
    const blocks = parseLegalContent("> quoted clause\n| table | row |");
    expect(blocks).toEqual([
      { type: "p", text: "> quoted clause" },
      { type: "p", text: "| table | row |" },
    ]);
  });

  it("closes a list when a blank line or heading follows", () => {
    expect(parseLegalContent("- a\n- b\n\nAfter.")).toEqual([
      { type: "ul", items: ["a", "b"] },
      { type: "p", text: "After." },
    ]);
    expect(parseLegalContent("- a\n## Next")).toEqual([
      { type: "ul", items: ["a"] },
      { type: "h2", text: "Next" },
    ]);
  });

  it("handles empty and whitespace-only content without throwing", () => {
    expect(parseLegalContent("")).toEqual([]);
    expect(parseLegalContent("\n\n   \n")).toEqual([]);
  });

  // Losing the final bullet of a list would quietly drop a clause.
  it("keeps a list that runs to the very end of the document", () => {
    const blocks = parseLegalContent("## T\n- last clause");
    expect(blocks[blocks.length - 1]).toEqual({ type: "ul", items: ["last clause"] });
  });
});

describe("starter drafts", () => {
  it("both parse into a substantial document", () => {
    expect(parseLegalContent(STARTER_TERMS).length).toBeGreaterThan(20);
    expect(parseLegalContent(STARTER_PRIVACY).length).toBeGreaterThan(20);
  });

  // The drafts are structure, not finished text. If a placeholder ever
  // disappeared, someone could publish them believing they were complete.
  it("still contain explicit placeholders that force review", () => {
    for (const draft of [STARTER_TERMS, STARTER_PRIVACY]) {
      expect(draft).toMatch(/\[[A-Z][A-Z /]+\]/);
      expect(draft).toContain("[LEGAL ENTITY NAME]");
    }
  });

  it("leaves liability to a lawyer instead of inventing wording", () => {
    expect(STARTER_TERMS).toContain("MUST BE DRAFTED BY YOUR LAWYER");
  });
});
