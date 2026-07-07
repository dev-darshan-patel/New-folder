"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function AdminError({
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
    <div className="mx-auto max-w-lg">
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-sm font-semibold text-destructive">Error</p>
          <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
            This page couldn&apos;t load
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Something went wrong loading this admin section. You can try again.
          </p>
          <Button onClick={reset} className="mt-6">
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
