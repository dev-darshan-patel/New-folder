import Link from "next/link";
import { getAdminAnalytics } from "@/lib/admin-metrics";
import { getPlanMap } from "@/lib/plans";
import { AreaChart, BarChart } from "@/components/admin/Charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const RANGES = [7, 30, 90];

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export default async function AdminOverview({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const sp = await searchParams;
  const range = RANGES.includes(Number(sp.range)) ? Number(sp.range) : 30;
  const [a, planMap] = await Promise.all([getAdminAnalytics(range), getPlanMap()]);

  const mrrPoints = a.series.map((p) => ({ label: shortDate(p.date), value: p.mrr }));
  const signupPoints = a.series.map((p) => ({ label: shortDate(p.date), value: p.signups }));
  const bookingPoints = a.series.map((p) => ({ label: shortDate(p.date), value: p.bookings }));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Platform overview
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Sales, growth, and activity across every account.
          </p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/admin?range=${r}`}
              className={`rounded-md px-3 py-1.5 font-medium ${
                r === range ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {r}d
            </Link>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="MRR" value={`$${a.kpis.mrr.toLocaleString()}`} sub={`ARR $${a.kpis.arr.toLocaleString()}`} highlight />
        <Kpi label="Paying users" value={a.kpis.payingUsers} sub={`${a.kpis.conversionPct.toFixed(0)}% conversion`} />
        <Kpi label="ARPU" value={`$${a.kpis.arpu.toFixed(2)}`} sub={`${a.kpis.totalUsers} users`} />
        <Kpi label="Churn" value={`${a.kpis.churnPct.toFixed(0)}%`} sub={`${a.kpis.churnedCount} canceled`} />
        <Kpi label="Activation" value={`${a.kpis.activationPct.toFixed(0)}%`} sub="got ≥1 booking" />
        <Kpi label="Active (30d)" value={a.kpis.activeBusinesses30} sub={`${a.kpis.activeBusinesses7} in 7d`} />
        <Kpi label="Bookings" value={a.kpis.totalBookings} sub={`+${a.kpis.bookingsInRange} in ${range}d`} />
        <Kpi label="Signups" value={a.kpis.totalUsers} sub={`+${a.kpis.signupsInRange} in ${range}d`} />
      </div>

      {/* Charts */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title={`MRR over ${range} days`}>
          <AreaChart points={mrrPoints} color="#4f46e5" prefix="$" />
        </Panel>
        <Panel title={`New signups (${range}d)`}>
          <AreaChart points={signupPoints} color="#16a34a" />
        </Panel>
        <Panel title={`Bookings created (${range}d)`}>
          <BarChart points={bookingPoints} color="#0ea5e9" />
        </Panel>
        <Panel title="Activation funnel">
          <Funnel funnel={a.funnel} />
        </Panel>
      </div>

      {/* Plan mix + leaderboards */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Plan mix">
          <div className="space-y-3">
            {a.planMix.map(({ plan, count }) => {
              const pct = a.kpis.totalUsers ? Math.round((count / a.kpis.totalUsers) * 100) : 0;
              return (
                <div key={plan}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-slate-700">{planMap.get(plan)?.name ?? plan}</span>
                    <span className="text-slate-500">{count} · {pct}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Top by bookings">
          <Leaderboard
            rows={a.topByBookings.map((t) => ({ id: t.id, name: t.name, value: `${t.bookings}` }))}
          />
        </Panel>
        <Panel title="Top by revenue">
          <Leaderboard
            rows={a.topByRevenue.map((t) => ({ id: t.id, name: t.name, value: `$${t.mrr}/mo` }))}
          />
        </Panel>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-indigo-200 bg-indigo-50" : ""}>
      <CardContent className="p-5">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
        {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {children}
      </CardContent>
    </Card>
  );
}

function Funnel({ funnel }: { funnel: { label: string; count: number }[] }) {
  const top = funnel[0]?.count || 1;
  return (
    <div className="space-y-2">
      {funnel.map((step) => {
        const pct = Math.round((step.count / top) * 100);
        return (
          <div key={step.label}>
            <div className="flex justify-between text-sm">
              <span className="text-slate-700">{step.label}</span>
              <span className="text-slate-500">{step.count} · {pct}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Leaderboard({ rows }: { rows: { id: string; name: string; value: string }[] }) {
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between py-2 text-sm">
          <Link href={`/admin/users/${r.id}`} className="truncate font-medium text-slate-800 hover:text-indigo-600">
            {r.name}
          </Link>
          <span className="shrink-0 text-slate-500">{r.value}</span>
        </li>
      ))}
      {rows.length === 0 && <li className="py-2 text-sm text-slate-400">No data yet.</li>}
    </ul>
  );
}
