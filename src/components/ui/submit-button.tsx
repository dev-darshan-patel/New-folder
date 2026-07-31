"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// A submit button that disables itself and shows a spinner while its form is
// in flight. Server actions on a cold function can take a second or two with
// no visual change otherwise, which reads as "nothing happened" and gets the
// user clicking again.
//
// useFormStatus reports the status of the nearest enclosing <form>, so this
// must be rendered inside the form it submits (not as a sibling). Outside a
// form it simply reports pending=false and behaves like a normal Button.
function SubmitButton({
  children,
  pendingLabel,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel?: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          {pendingLabel ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

export { SubmitButton };
