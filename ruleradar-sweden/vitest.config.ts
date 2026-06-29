import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    environment: "node"
  },
  resolve: {
    alias: {
      "@ruleradar/shared": new URL("./packages/shared/src/index.ts", import.meta.url).pathname,
      "@ruleradar/db": new URL("./packages/db/src/index.ts", import.meta.url).pathname,
      "@ruleradar/monitoring": new URL("./packages/monitoring/src/index.ts", import.meta.url).pathname,
      "@ruleradar/ai": new URL("./packages/ai/src/index.ts", import.meta.url).pathname,
      "@ruleradar/notifications": new URL("./packages/notifications/src/index.ts", import.meta.url).pathname
    }
  }
});
