import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { planConfig } from "@/lib/plans";
import { ensureOwnerTeamMember } from "@/lib/team";
import {
  addTeamMemberAction,
  removeTeamMemberAction,
  setMemberActiveAction,
  setOwnerParticipationAction,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  if (!planConfig(user.plan).teamScheduling) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Team</h1>
        <p className="mt-2 text-sm text-slate-600">
          Team scheduling (round-robin and collective booking) is available on the
          Business plan.{" "}
          <Link href="/dashboard/billing" className="font-medium text-indigo-600 hover:underline">
            Upgrade
          </Link>
          .
        </p>
      </div>
    );
  }

  await ensureOwnerTeamMember(user.id, user.name);
  const members = await prisma.teamMember.findMany({
    where: { userId: user.id },
    orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
  });
  const owner = members.find((m) => m.isOwner)!;
  const others = members.filter((m) => !m.isOwner);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Team</h1>
      <p className="mt-1 text-sm text-slate-600">
        Add teammates and set their hours so round-robin and collective event types
        know who&apos;s available.
      </p>

      <Card className="mt-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-slate-900">{owner.name} (you)</p>
              <p className="text-xs text-slate-500">
                {owner.active ? "Bookable in team event types" : "Not currently bookable"}
              </p>
            </div>
            <form action={setOwnerParticipationAction}>
              <input type="hidden" name="active" value={owner.active ? "0" : "1"} />
              <Button
                type="submit"
                variant="outline"
                size="sm"
              >
                {owner.active ? "Remove myself from pools" : "Include myself as a bookable member"}
              </Button>
            </form>
          </div>
          <Link
            href={`/dashboard/team/${owner.id}/availability`}
            className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:underline"
          >
            Set my team hours →
          </Link>
        </CardContent>
      </Card>

      <div className="mt-4 space-y-3">
        {others.map((m) => (
          <Card key={m.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900">{m.name}</p>
                  {m.email && <p className="text-xs text-slate-500">{m.email}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <form action={setMemberActiveAction}>
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="active" value={m.active ? "0" : "1"} />
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                    >
                      {m.active ? "Deactivate" : "Activate"}
                    </Button>
                  </form>
                  <form action={removeTeamMemberAction}>
                    <input type="hidden" name="id" value={m.id} />
                    <Button type="submit" variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                      Remove
                    </Button>
                  </form>
                </div>
              </div>
              <Link
                href={`/dashboard/team/${m.id}/availability`}
                className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:underline"
              >
                Set hours →
              </Link>
            </CardContent>
          </Card>
        ))}
        {others.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No teammates yet.
          </p>
        )}
      </div>

      <Card className="mt-6">
        <form action={addTeamMemberAction}>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email (optional)</Label>
              <Input
                id="email"
                name="email"
                type="email"
              />
            </div>
            <Button
              type="submit"
            >
              Add teammate
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
