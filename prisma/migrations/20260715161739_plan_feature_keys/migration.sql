-- Plan-based feature gating: admin-selectable feature keys per plan,
-- superseding the customBranding/teamScheduling booleans (kept for now,
-- see schema comment).

ALTER TABLE "Plan" ADD COLUMN "featureKeys" TEXT[] NOT NULL DEFAULT '{}';

-- Backfill the three shipped plans per the agreed matrix. Any other
-- (admin-created) plan rows are left at '{}' — an admin reviews and sets
-- their features explicitly via the new checkbox grid.
UPDATE "Plan" SET "featureKeys" = ARRAY['custom_branding', 'embed_widget']
WHERE "id" = 'FREE';

UPDATE "Plan" SET "featureKeys" = ARRAY[
  'custom_branding', 'embed_widget', 'intake_questions', 'scheduling_limits',
  'video_links', 'guest_invites', 'approval_flow', 'redirect_replyto',
  'csv_export', 'manual_bookings'
]
WHERE "id" = 'PRO';

UPDATE "Plan" SET "featureKeys" = ARRAY[
  'custom_branding', 'embed_widget', 'intake_questions', 'scheduling_limits',
  'video_links', 'guest_invites', 'approval_flow', 'redirect_replyto',
  'csv_export', 'manual_bookings', 'team_scheduling', 'payments',
  'group_bookings', 'recurring_bookings', 'calendar_busy_sync'
]
WHERE "id" = 'BUSINESS';
