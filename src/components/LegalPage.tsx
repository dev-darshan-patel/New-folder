import Link from "next/link";
import type { Metadata } from "next";
import { getPlatformSettings } from "@/lib/settings";
import { parseLegalContent } from "@/lib/legal";
import { PRODUCT_NAME } from "@/lib/brand";

// Shared renderer for /terms and /privacy. Both pages are identical apart from
// which field they read, so they share one component rather than two
// near-copies that drift.
export async function legalMetadata(title: string): Promise<Metadata> {
  return { title: `${title} — ${PRODUCT_NAME}` };
}

export default async function LegalPage({
  title,
  field,
}: {
  title: string;
  field: "terms" | "privacy";
}) {
  const settings = await getPlatformSettings();
  const content = field === "terms" ? settings.termsContent : settings.privacyContent;
  const updatedAt = field === "terms" ? settings.termsUpdatedAt : settings.privacyUpdatedAt;

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground">
        ← {PRODUCT_NAME}
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">{title}</h1>

      {content ? (
        <>
          {updatedAt && (
            <p className="mt-2 text-sm text-muted-foreground">
              Last updated{" "}
              {updatedAt.toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          )}
          <article className="mt-8 space-y-4">
            {parseLegalContent(content).map((block, i) => {
              if (block.type === "h2") {
                return (
                  <h2 key={i} className="mt-8 text-xl font-semibold text-foreground">
                    {block.text}
                  </h2>
                );
              }
              if (block.type === "h3") {
                return (
                  <h3 key={i} className="mt-6 text-base font-semibold text-foreground">
                    {block.text}
                  </h3>
                );
              }
              if (block.type === "ul") {
                return (
                  <ul key={i} className="list-disc space-y-1 pl-6 text-sm leading-relaxed text-slate-700">
                    {block.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                );
              }
              return (
                <p key={i} className="text-sm leading-relaxed text-slate-700">
                  {block.text}
                </p>
              );
            })}
          </article>
        </>
      ) : (
        // Deliberately NOT a placeholder policy. An empty agreement that looks
        // like a real one is worse than an obviously missing one — people
        // would rely on it.
        <div className="mt-8 rounded-lg border border-dashed border-input p-8 text-center">
          <p className="text-sm font-medium text-foreground">Not published yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            The operator of this site hasn&rsquo;t published {title.toLowerCase()} yet.
            {settings.supportEmail && (
              <>
                {" "}
                For questions, contact{" "}
                <a href={`mailto:${settings.supportEmail}`} className="text-primary underline">
                  {settings.supportEmail}
                </a>
                .
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
