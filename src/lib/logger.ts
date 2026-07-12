import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug"),
  ...(process.env.NODE_ENV !== "production" && {
    transport: { target: "pino-pretty", options: { colorize: true } },
  }),
});

export default logger;

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
