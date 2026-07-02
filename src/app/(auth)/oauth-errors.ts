const MESSAGES: Record<string, string> = {
  oauth_failed: "Something went wrong signing in. Please try again.",
  oauth_not_configured: "That sign-in option isn't set up yet — use email and password instead.",
  oauth_disabled: "Social sign-in is temporarily disabled — use email and password instead.",
  oauth_email_unverified:
    "That account's email isn't verified with the provider. Verify it and try again.",
  suspended: "This account has been suspended. Contact support.",
  deleted: "This account no longer exists.",
};

export function oauthErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? "Something went wrong signing in. Please try again.";
}
