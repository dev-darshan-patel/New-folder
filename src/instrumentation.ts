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
};
