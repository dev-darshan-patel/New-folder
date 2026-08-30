import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { resolveErrorAction, deleteErrorAction } from "./actions";

const PAGE_SIZE = 25;

// Server errors captured by instrumentation's onRequestError. Before this,
// they went only to pino — ephemeral on serverless, unread on a VPS — so in
// practice nobody found out something had broken.
export default async function AdminErrorsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; show?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const showResolved = sp.show === "all";

  const where = showResolved ? {} : { resolvedAt: null };
  const [total, unresolved, events, settings] = await Promise.all([
    prisma.errorEvent.count({ where }),
    prisma.errorEvent.count({ where: { resolvedAt: null } }),
    prisma.errorEvent.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.platformSettings.findUnique({
      where: { id: "singleton" },
      select: { alertEmail: true },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Errors</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Server errors captured across the platform, grouped by cause. {unresolved} unresolved.
      </p>

      {!settings?.alertEmail && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No alert address set — errors are recorded here but nobody is emailed when a new one
          appears. Add one under Platform config.
        </p>
      )}

      <div className="mt-4 flex gap-2 text-sm">
        <Link
          href="/admin/errors"
          className={!showResolved ? "font-semibold text-primary" : "text-muted-foreground"}
        >
          Unresolved
        </Link>
        <Link
          href="/admin/errors?show=all"
          className={showResolved ? "font-semibold text-primary" : "text-muted-foreground"}
        >
          All
        </Link>
      </div>

      {events.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-input p-8 text-center text-sm text-muted-foreground">
          Nothing here — no errors recorded.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {events.map((e) => (
            <li key={e.id} className="rounded-lg border border-border bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium break-words text-foreground">{e.message}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {e.routePath && <code className="rounded bg-muted px-1">{e.routePath}</code>}
                    {e.method && <span>{e.method}</span>}
                    {e.routeType && <span>{e.routeType}</span>}
                    <span>
                      {e.count}× · first {e.firstSeenAt.toLocaleString()} · last{" "}
                      {e.lastSeenAt.toLocaleString()}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {e.resolvedAt ? (
                    <Badge variant="secondary">Resolved</Badge>
                  ) : (
                    <form action={resolveErrorAction}>
                      <input type="hidden" name="id" value={e.id} />
                      <SubmitButton variant="link" size="sm">
                        Resolve
                      </SubmitButton>
                    </form>
                  )}
                  <form action={deleteErrorAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <SubmitButton variant="link" size="sm" className="text-red-600">
                      Delete
                    </SubmitButton>
                  </form>
                </div>
              </div>
              {e.stack && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    Stack trace
                  </summary>
                  <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
                    {e.stack}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center gap-3 text-sm">
          {page > 1 && (
            <Link
              href={`/admin/errors?page=${page - 1}${showResolved ? "&show=all" : ""}`}
              className="text-primary hover:underline"
            >
              ← Previous
            </Link>
          )}
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/admin/errors?page=${page + 1}${showResolved ? "&show=all" : ""}`}
              className="text-primary hover:underline"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
