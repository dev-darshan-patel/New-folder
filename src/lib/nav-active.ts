// Which sidebar link should be highlighted for the current path.
//
// A link matches its own path plus any deeper path under it, so
// /admin/users stays highlighted on /admin/users/abc123. The exception is a
// link that is a prefix of another link in the same nav — /admin/settings sits
// above /admin/settings/auth, and /dashboard above everything — where
// prefix-matching would light up two items at once (or all of them). Those
// match exactly instead.
//
// Deriving that from the nav config rather than hand-tagging each item means
// adding a new child link later fixes its parent automatically.
export function isNavActive(
  pathname: string,
  href: string,
  allHrefs: readonly string[],
): boolean {
  if (pathname === href) return true;
  const hasChildLink = allHrefs.some((other) => other !== href && other.startsWith(`${href}/`));
  if (hasChildLink) return false;
  return pathname.startsWith(`${href}/`);
}
