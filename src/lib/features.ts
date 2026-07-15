// Plan-gated feature registry. Each entry is a capability a super admin can
// toggle on/off per plan from /admin/settings/plans/[id]. Kept as code (not a
// DB table) because a key is only meaningful when a matching server-side gate
// exists somewhere in the app — an admin can't invent a new gate from the UI,
// only turn an existing one on or off per plan.
//
// This is the ONLY place that lists what's gateable. Adding a new gated
// capability later means: add an entry here, add its server-side check
// (see planHasFeature in src/lib/plans.ts), done — the admin checkbox grid
// and the plan-seed defaults both read from this array.
export type FeatureKey =
  | "custom_branding"
  | "embed_widget"
  | "intake_questions"
  | "scheduling_limits"
  | "video_links"
  | "guest_invites"
  | "approval_flow"
  | "redirect_replyto"
  | "csv_export"
  | "manual_bookings"
  | "team_scheduling"
  | "payments"
  | "group_bookings"
  | "recurring_bookings"
  | "calendar_busy_sync";

export type FeatureDefinition = {
  key: FeatureKey;
  label: string;
  description: string;
};

export const FEATURE_REGISTRY: FeatureDefinition[] = [
  {
    key: "custom_branding",
    label: "Custom branding",
    description: "Custom accent color, font, logo, and welcome message on the booking page.",
  },
  {
    key: "embed_widget",
    label: "Embeddable widget",
    description: "Embed the booking page directly on the tenant's own website.",
  },
  {
    key: "intake_questions",
    label: "Custom intake questions",
    description: "Collect extra info from invitees when they book.",
  },
  {
    key: "scheduling_limits",
    label: "Scheduling limits",
    description: "Set minimum notice and daily/weekly/monthly booking caps.",
  },
  {
    key: "video_links",
    label: "Auto video links",
    description: "Auto-generate Google Meet or Zoom links for online meetings.",
  },
  {
    key: "guest_invites",
    label: "Guest invites",
    description: "Let invitees add extra guests to a booking.",
  },
  {
    key: "approval_flow",
    label: "Manual approval",
    description: "Require the owner's approval before a booking is confirmed.",
  },
  {
    key: "redirect_replyto",
    label: "Custom redirect & reply-to",
    description: "Redirect invitees after booking and set a custom reply-to address.",
  },
  {
    key: "csv_export",
    label: "CSV export",
    description: "Export bookings to a CSV file.",
  },
  {
    key: "manual_bookings",
    label: "Manual bookings",
    description: "Create bookings directly from the dashboard for phone/walk-in customers.",
  },
  {
    key: "team_scheduling",
    label: "Team scheduling",
    description: "Round-robin and collective scheduling across a team.",
  },
  {
    key: "payments",
    label: "Accept payments",
    description: "Charge customers when they book a paid event type.",
  },
  {
    key: "group_bookings",
    label: "Group sessions",
    description: "Let multiple invitees book into the same session up to a capacity.",
  },
  {
    key: "recurring_bookings",
    label: "Recurring bookings",
    description: "Let invitees book a weekly recurring series.",
  },
  {
    key: "calendar_busy_sync",
    label: "Calendar busy-sync",
    description: "Block booking slots when the owner is busy on their connected Google Calendar.",
  },
];

export const FEATURE_KEYS: FeatureKey[] = FEATURE_REGISTRY.map((f) => f.key);

export function isFeatureKey(value: string): value is FeatureKey {
  return (FEATURE_KEYS as string[]).includes(value);
}

export function featureLabel(key: string): string {
  return FEATURE_REGISTRY.find((f) => f.key === key)?.label ?? key;
}
