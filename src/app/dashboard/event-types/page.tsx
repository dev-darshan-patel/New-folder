import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlanConfig } from "@/lib/plans";
import {
  createEventTypeAction,
  deleteEventTypeAction,
  toggleEventTypeActiveAction,
  cloneEventTypeAction,
} from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import CopyLinkButton from "./CopyLinkButton";

export default async function EventTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) return null;

  const sp = await searchParams;
  const eventTypes = await prisma.eventType.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });

  const planCfg = await getPlanConfig(user.plan);
  const limit = planCfg.maxEventTypes;
  const atLimit = limit !== null && eventTypes.length >= limit;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">
        Event Types
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        The meeting types your customers can book.{" "}
        <span className="font-medium text-slate-700">
          {eventTypes.length}
          {limit !== null ? ` of ${limit}` : ""} used
        </span>{" "}
        on the {planCfg.name} plan.
      </p>

      {(sp.limit || atLimit) && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>
            You&apos;ve reached your plan&apos;s event-type limit.
          </span>
          <Button asChild className="shrink-0" variant="secondary">
            <Link
              href="/dashboard/billing"
            >
              Upgrade
            </Link>
          </Button>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {eventTypes.map((et) => {
          const url = `${baseUrl}/${user.slug}/${et.slug}`;
          return (
            <Card key={et.id} className={et.active ? "" : "opacity-60"}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{et.title}</p>
                    <p className="text-sm text-slate-500">{et.durationMinutes} min</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {!et.active && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                        Inactive
                      </span>
                    )}
                    {et.unlisted && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Unlisted
                      </span>
                    )}
                  </div>
                </div>

                <p className="mt-2 truncate text-xs text-slate-400">{url}</p>

                <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-3">
                  <CopyLinkButton url={url} />
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/dashboard/event-types/${et.id}`}>Edit</Link>
                  </Button>
                  <form action={cloneEventTypeAction}>
                    <input type="hidden" name="id" value={et.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Clone
                    </Button>
                  </form>
                  <form action={toggleEventTypeActiveAction}>
                    <input type="hidden" name="id" value={et.id} />
                    <input type="hidden" name="active" value={et.active ? "0" : "1"} />
                    <Button type="submit" variant="ghost" size="sm">
                      {et.active ? "Deactivate" : "Activate"}
                    </Button>
                  </form>
                  <form action={deleteEventTypeAction}>
                    <input type="hidden" name="id" value={et.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {eventTypes.length === 0 && (
          <Card className="sm:col-span-2">
            <CardContent className="border-dashed p-6 text-center text-sm text-slate-500">
              No event types yet. Create one below.
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>New event type</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createEventTypeAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                required
                placeholder="e.g. 15 Minute Discovery Call"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="durationMinutes">Duration (minutes)</Label>
                <NativeSelect
                  id="durationMinutes"
                  name="durationMinutes"
                  defaultValue="30"
                >
                  {[15, 30, 45, 60, 90].map((d) => (
                    <option key={d} value={d}>
                      {d} min
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                name="description"
                rows={2}
              />
            </div>
            <Button
              type="submit"
              disabled={atLimit}
            >
              {atLimit ? "Upgrade to add more" : "Create event type"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
