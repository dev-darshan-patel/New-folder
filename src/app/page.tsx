import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <span className="text-lg font-bold tracking-tight text-slate-900">
          Bookify<span className="text-indigo-600">.</span>
        </span>
        <nav className="flex items-center gap-4 text-sm">
          <Button variant="ghost" asChild>
            <Link href="/login">
              Log in
            </Link>
          </Button>
          <Button asChild className="rounded-full">
            <Link href="/signup">
              Get started
            </Link>
          </Button>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-indigo-600">
          Scheduling for small business
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">
          Let customers book you in a click
        </h1>
        <p className="mt-6 max-w-xl text-lg text-slate-600">
          Create your account, set your hours, and share one link. Your customers
          pick a time that works — no back-and-forth.
        </p>
        <div className="mt-10 flex gap-4">
          <Button size="lg" className="rounded-full" asChild>
            <Link href="/signup">
              Create your booking page
            </Link>
          </Button>
          <Button size="lg" variant="ghost" className="rounded-full" asChild>
            <Link href="/login">
              Log in →
            </Link>
          </Button>
        </div>
      </main>

      <footer className="border-t border-slate-100 py-6 text-center text-sm text-slate-400">
        © {new Date().getFullYear()} Bookify. A scheduling platform for small business.
      </footer>
    </div>
  );
}
