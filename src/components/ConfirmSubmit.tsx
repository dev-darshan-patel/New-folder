"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

// Wraps a server-action submit in a confirmation dialog. Use for anything
// irreversible — the trigger looks like a normal button, but nothing is
// submitted until the user confirms in the dialog.
//
// `action` is a server action passed down from a server component (server
// actions are serializable across the boundary, so this stays a client
// component without pulling the action's implementation into the bundle).
// `fields` become hidden inputs on the real form inside the dialog.
export default function ConfirmSubmit({
  action,
  fields,
  label,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  className,
  size = "sm",
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields?: Record<string, string>;
  label: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  className?: string;
  size?: "default" | "sm" | "lg";
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size={size} className={className}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <form action={action}>
            {Object.entries(fields ?? {}).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <AlertDialogAction
              type="submit"
              className={destructive ? "w-full bg-destructive text-white hover:bg-destructive/90" : "w-full"}
            >
              {confirmLabel}
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
