export default function BusinessPageLoading() {
  return (
    <div className="mx-auto max-w-md animate-pulse px-6 py-16 text-center">
      <div className="mx-auto h-16 w-16 rounded-full bg-slate-200" />
      <div className="mx-auto mt-4 h-6 w-40 rounded bg-slate-200" />
      <div className="mx-auto mt-2 h-4 w-56 rounded bg-slate-100" />
      <div className="mt-8 space-y-3 text-left">
        {[0, 1].map((i) => (
          <div key={i} className="h-16 rounded-lg border border-slate-200 bg-white p-4">
            <div className="h-4 w-1/2 rounded bg-slate-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
