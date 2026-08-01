export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-4">
      <div className="h-7 w-40 rounded bg-slate-200" />
      <div className="h-4 w-64 rounded bg-muted" />
      <div className="mt-6 space-y-2 rounded-lg border border-border bg-white p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}
