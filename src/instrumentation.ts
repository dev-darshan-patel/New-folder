import type { Instrumentation } from "next";
import logger from "@/lib/logger";

export function register() {
  logger.info("Next.js server started");
}

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  logger.error(
    {
      err,
      path: request.path,
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
    },
    "Unhandled request error",
  );

  // Also store it durably so it survives the log buffer and shows up at
  // /admin/errors.
  //
  // The NEXT_RUNTIME guard is load-bearing, not defensive: instrumentation is
  // compiled for the Edge runtime as well as Node, and a bare dynamic import
  // is still traced by the bundler — which pulls Prisma and node:crypto into
  // an Edge bundle that can't support them, and breaks this hook entirely.
  // (Found the hard way: the whole handler failed to compile and no error was
  // ever captured.) NEXT_RUNTIME is the documented way to target one runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { captureError } = await import("@/lib/error-tracking");
    await captureError(err, {
      routePath: context.routePath ?? request.path,
      method: request.method,
      routeType: context.routeType,
    });
  } catch (captureErr) {
    logger.error({ err: captureErr }, "Failed to persist request error");
  }
};
