"use client";

import { logoutAction } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";

// Log-out form with a confirm() guard so it can't be triggered by an accidental
// click. Used in both the admin and dashboard sidebars.
export default function LogoutButton({ className }: { className?: string }) {
  return (
    <form
      action={logoutAction}
      onSubmit={(e) => {
        if (!confirm("Log out of your account?")) e.preventDefault();
      }}
    >
      <Button type="submit" variant="ghost" className={className}>
        Log out
      </Button>
    </form>
  );
}
