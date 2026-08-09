import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Mirrors tsconfig's "@/*" -> "./src/*" mapping — Vitest doesn't read
      // tsconfig paths on its own.
      "@": path.resolve(import.meta.dirname, "./src"),
      // See test/stubs/server-only.ts for why this is aliased.
      "server-only": path.resolve(import.meta.dirname, "./test/stubs/server-only.ts"),
    },
  },
});
