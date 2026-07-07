import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  TEMPLATE_DEFS,
  CATEGORY_LABELS,
  ensureEmailTemplates,
  type TemplateCategory,
} from "@/lib/email-templates";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleEmailTemplateAction } from "./actions";
import BrandingEditor from "./BrandingEditor";
import ImportButton from "./ImportButton";

export default async function EmailTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const viewer = await getCurrentUser();
  if (!viewer || viewer.adminRole !== "SUPER_ADMIN") {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Email templates</h1>
        <p className="mt-2 text-sm text-slate-500">Restricted to Super Admins.</p>
      </div>
    );
  }

  await ensureEmailTemplates();
  const { q } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();

  const [rows, settings] = await Promise.all([
    prisma.emailTemplate.findMany(),
    prisma.platformSettings.findUnique({
      where: { id: "singleton" },
      select: {
        emailBrandName: true,
        emailLogoUrl: true,
        emailAccentColor: true,
        emailFooterText: true,
        emailSupportUrl: true,
      },
    }),
  ]);
  const enabledByKey = new Map(rows.map((r) => [r.key, r.enabled]));

  const filtered = TEMPLATE_DEFS.filter(
    (d) =>
      !query ||
      d.name.toLowerCase().includes(query) ||
      d.key.toLowerCase().includes(query) ||
      d.description.toLowerCase().includes(query),
  );

  const categories: TemplateCategory[] = ["BOOKING", "AUTH", "ACCOUNT", "NOTIFICATION"];

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Email templates</h1>
      <p className="mt-1 text-sm text-slate-600">
        Edit every transactional email the platform sends. Disabled templates fall back to the
        built-in default, so delivery never breaks.
      </p>

      {/* Global branding shell */}
      <Card className="mt-6">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Global branding</h2>
              <p className="mt-0.5 text-sm text-slate-600">
                The header, accent color, and footer wrapping every email.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Route handler returns a file download — must be a plain <a>, not next/link. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/admin/settings/email-templates/export"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Export JSON
              </a>
              <ImportButton />
            </div>
          </div>
          <div className="mt-5">
            <BrandingEditor
              initial={{
                emailBrandName: settings?.emailBrandName ?? "",
                emailLogoUrl: settings?.emailLogoUrl ?? "",
                emailAccentColor: settings?.emailAccentColor ?? "",
                emailFooterText: settings?.emailFooterText ?? "",
                emailSupportUrl: settings?.emailSupportUrl ?? "",
              }}
            />
          </div>
        </CardContent>
      </Card>

      <form className="mt-8">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search templates…"
          className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
        />
      </form>

      <div className="mt-6 space-y-8">
        {categories.map((cat) => {
          const items = filtered.filter((d) => d.category === cat);
          if (items.length === 0) return null;
          return (
            <section key={cat}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {CATEGORY_LABELS[cat]}
              </h2>
              <div className="mt-3 space-y-3">
                {items.map((def) => {
                  const enabled = enabledByKey.get(def.key) ?? true;
                  return (
                    <Card key={def.key}>
                      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/admin/settings/email-templates/${def.key}`}
                              className="font-medium text-slate-900 hover:text-indigo-600 hover:underline"
                            >
                              {def.name}
                            </Link>
                            <Badge variant={enabled ? "success" : "muted"}>
                              {enabled ? "Active" : "Disabled"}
                            </Badge>
                          </div>
                          <p className="mt-0.5 font-mono text-xs text-slate-400">{def.key}</p>
                          <p className="mt-2 text-sm text-slate-600">{def.description}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <form action={toggleEmailTemplateAction}>
                            <input type="hidden" name="key" value={def.key} />
                            <input type="hidden" name="enabled" value={(!enabled).toString()} />
                            <Button type="submit" variant="outline" size="sm">
                              {enabled ? "Disable" : "Enable"}
                            </Button>
                          </form>
                          <Link
                            href={`/admin/settings/email-templates/${def.key}`}
                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
                          >
                            Edit
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-slate-500">No templates match &ldquo;{q}&rdquo;.</p>
        )}
      </div>
    </div>
  );
}
