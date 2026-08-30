import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getPlatformSettings } from "@/lib/settings";
import { LEGAL_REVIEW_WARNING, STARTER_TERMS, STARTER_PRIVACY } from "@/lib/legal";
import { updateLegalContentAction } from "./actions";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";

export default async function AdminLegalPage() {
  const viewer = await getCurrentUser();
  if (!viewer || viewer.adminRole !== "SUPER_ADMIN") {
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Legal pages</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Legal pages are restricted to Super Admins.
        </p>
      </div>
    );
  }

  const settings = await getPlatformSettings();

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Legal pages</h1>
      <p className="mt-1 text-sm text-slate-600">
        Published at{" "}
        <Link href="/terms" className="text-primary underline">
          /terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-primary underline">
          /privacy
        </Link>
        . Until you publish something, those pages say so plainly rather than showing placeholder
        text that looks like a real agreement.
      </p>

      {/* Stated here as well as in the drafts themselves — this is the one
          screen where someone might paste a template and consider it done. */}
      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-sm font-semibold text-amber-900">Not legal advice</p>
        <p className="mt-1 text-sm text-amber-900">{LEGAL_REVIEW_WARNING}</p>
      </div>

      <form action={updateLegalContentAction} className="mt-6 space-y-6">
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Label>Terms of Service</Label>
              <span className="text-xs text-muted-foreground">
                {settings.termsUpdatedAt
                  ? `Last updated ${settings.termsUpdatedAt.toLocaleDateString()}`
                  : "Not published"}
              </span>
            </div>
            <Textarea
              name="termsContent"
              rows={16}
              defaultValue={settings.termsContent ?? ""}
              placeholder="Paste your Terms of Service here, or copy the starting draft below."
              className="font-mono text-xs"
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Label>Privacy Policy</Label>
              <span className="text-xs text-muted-foreground">
                {settings.privacyUpdatedAt
                  ? `Last updated ${settings.privacyUpdatedAt.toLocaleDateString()}`
                  : "Not published"}
              </span>
            </div>
            <Textarea
              name="privacyContent"
              rows={16}
              defaultValue={settings.privacyContent ?? ""}
              placeholder="Paste your Privacy Policy here, or copy the starting draft below."
              className="font-mono text-xs"
            />
          </CardContent>
        </Card>

        <div className="space-y-1">
          <SubmitButton>Save legal pages</SubmitButton>
          <p className="text-xs text-muted-foreground">
            Formatting: <code>## Heading</code>, <code>### Subheading</code>, <code>- bullet</code>,
            blank line between paragraphs. The date shown to visitors only changes when that
            document&rsquo;s text actually changes.
          </p>
        </div>
      </form>

      {/* Presented as copyable text rather than a one-click "insert" button:
          loading a draft should be a deliberate act you had to read past this
          warning to perform, not a button someone clicks and forgets. */}
      <section className="mt-10 border-t border-border pt-6">
        <h2 className="text-lg font-semibold text-foreground">Starting drafts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A structure to start from — the sections a scheduling service usually needs. Every
          [PLACEHOLDER] must be replaced, the liability section must be written by your lawyer, and
          the whole thing reviewed for your jurisdiction before you publish it.
        </p>
        <details className="mt-4 rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            Terms of Service draft
          </summary>
          <pre className="mt-3 max-h-96 overflow-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap">
            {STARTER_TERMS}
          </pre>
        </details>
        <details className="mt-3 rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            Privacy Policy draft
          </summary>
          <pre className="mt-3 max-h-96 overflow-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap">
            {STARTER_PRIVACY}
          </pre>
        </details>
      </section>
    </div>
  );
}
