export default function EventTypePageLoading() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse px-6 py-16">
      <div className="h-6 w-48 rounded bg-slate-200" />
      <div className="mt-2 h-4 w-64 rounded bg-slate-100" />
      <div className="mt-8 grid gap-8 sm:grid-cols-[1fr_1.2fr]">
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded-lg border border-slate-200 bg-white" />
          ))}
        </div>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 rounded-lg border border-slate-200 bg-white" />
          ))}
        </div>
      </div>
    </div>
  );
}
