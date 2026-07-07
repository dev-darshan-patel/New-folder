"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function BusinessPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-bold tracking-tight text-slate-900">
        This page couldn&apos;t load
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        Something went wrong. Please try again in a moment.
      </p>
      <Button onClick={reset} className="mt-6">
        Try again
      </Button>
    </div>
  );
}
