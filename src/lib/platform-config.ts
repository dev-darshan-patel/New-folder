import "server-only";
import { getPlatformSettings } from "@/lib/settings";

export type PlatformConfig = {
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  signupsEnabled: boolean;
  supportEmail: string | null;
};

export async function getPlatformConfig(): Promise<PlatformConfig> {
  const s = await getPlatformSettings();
  return {
    maintenanceMode: s.maintenanceMode,
    maintenanceMessage: s.maintenanceMessage,
    signupsEnabled: s.signupsEnabled,
    supportEmail: s.supportEmail,
  };
}

export async function isPublicBookingAllowed(): Promise<boolean> {
  const { maintenanceMode } = await getPlatformConfig();
  return !maintenanceMode;
}
