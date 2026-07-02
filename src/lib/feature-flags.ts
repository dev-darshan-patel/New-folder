import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

export type FeatureFlagDef = {
  key: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
};

// Stable keys referenced in application code. Admin UI seeds missing rows on load.
export const FEATURE_FLAG_DEFS: FeatureFlagDef[] = [
  {
    key: "oauth_login",
    label: "OAuth sign-in",
    description: "Show Google and Microsoft buttons on login and signup.",
    defaultEnabled: true,
  },
  {
    key: "email_reminders",
    label: "Email reminders",
    description: "Send 24h and 1h booking reminder emails via the cron endpoint.",
    defaultEnabled: true,
  },
  {
    key: "embed_widget",
    label: "Embeddable widget",
    description: "Allow Pro/Business tenants to use the embeddable booking widget.",
    defaultEnabled: true,
  },
  {
    key: "calendar_sync",
    label: "Calendar sync",
    description: "Google/Outlook calendar integration (not built yet — flag for rollout).",
    defaultEnabled: false,
  },
  {
    key: "team_scheduling",
    label: "Team scheduling",
    description: "Round-robin & collective multi-staff scheduling. Shipped; gated to the Business plan.",
    defaultEnabled: true,
  },
];

export async function ensureFeatureFlags() {
  for (const def of FEATURE_FLAG_DEFS) {
    await prisma.featureFlag.upsert({
      where: { key: def.key },
      create: {
        key: def.key,
        label: def.label,
        description: def.description,
        enabled: def.defaultEnabled,
      },
      update: {},
    });
  }
}

export const getFeatureFlags = cache(async () => {
  await ensureFeatureFlags();
  const rows = await prisma.featureFlag.findMany({ orderBy: { key: "asc" } });
  return rows;
});

export async function isFeatureEnabled(key: string): Promise<boolean> {
  await ensureFeatureFlags();
  const row = await prisma.featureFlag.findUnique({ where: { key } });
  if (!row) {
    const def = FEATURE_FLAG_DEFS.find((d) => d.key === key);
    return def?.defaultEnabled ?? false;
  }
  return row.enabled;
}
