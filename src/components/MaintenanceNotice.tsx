import { getPlatformConfig } from "@/lib/platform-config";

export default async function MaintenanceNotice() {
  const { maintenanceMode, maintenanceMessage, supportEmail } = await getPlatformConfig();
  if (!maintenanceMode) return null;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Temporarily unavailable</h1>
      <p className="mt-3 text-sm text-slate-600">
        {maintenanceMessage ||
          "This booking page is temporarily unavailable while we perform maintenance."}
      </p>
      {supportEmail && (
        <p className="mt-4 text-sm text-slate-500">
          Questions?{" "}
          <a href={`mailto:${supportEmail}`} className="font-medium text-indigo-600 hover:underline">
            {supportEmail}
          </a>
        </p>
      )}
    </div>
  );
}
