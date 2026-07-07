import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTemplateDef, getEmailBrand, CATEGORY_LABELS } from "@/lib/email-templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resetEmailTemplateAction, toggleEmailTemplateAction } from "../actions";
import TemplateEditor from "./TemplateEditor";

export default async function EditEmailTemplatePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const viewer = await getCurrentUser();
  if (!viewer || viewer.adminRole !== "SUPER_ADMIN") {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Email template</h1>
        <p className="mt-2 text-sm text-slate-500">Restricted to Super Admins.</p>
      </div>
    );
  }

  const { key } = await params;
  const def = getTemplateDef(key);
  if (!def) notFound();

  const [row, brand] = await Promise.all([
    prisma.emailTemplate.findUnique({ where: { key } }),
    getEmailBrand(),
  ]);
  const enabled = row?.enabled ?? true;
  const initial = {
    subject: row?.subject ?? def.subject,
    html: row?.html ?? def.html,
    text: row?.text ?? def.text,
  };

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/admin/settings/email-templates"
        className="text-sm text-slate-500 hover:text-indigo-600"
      >
        ← All templates
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{def.name}</h1>
            <Badge variant={enabled ? "success" : "muted"}>
              {enabled ? "Active" : "Disabled"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {CATEGORY_LABELS[def.category]} · <span className="font-mono text-xs">{def.key}</span>
          </p>
          <p className="mt-1 text-sm text-slate-500">{def.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <form action={toggleEmailTemplateAction}>
            <input type="hidden" name="key" value={def.key} />
            <input type="hidden" name="enabled" value={(!enabled).toString()} />
            <Button type="submit" variant="outline" size="sm">
              {enabled ? "Disable" : "Enable"}
            </Button>
          </form>
          <form action={resetEmailTemplateAction}>
            <input type="hidden" name="key" value={def.key} />
            <Button type="submit" variant="outline" size="sm">
              Reset to default
            </Button>
          </form>
        </div>
      </div>

      {!enabled && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          This template is disabled — the built-in default is currently being sent. Enable it to
          use your edits.
        </p>
      )}

      <div className="mt-6">
        <TemplateEditor
          templateKey={def.key}
          vars={def.vars}
          initial={initial}
          brand={brand}
        />
      </div>
    </div>
  );
}
