export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse space-y-4">
      <div className="h-7 w-40 rounded bg-slate-200" />
      <div className="h-4 w-64 rounded bg-slate-100" />
      <div className="mt-6 space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 rounded bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
