import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    environment: "node"
  },
  resolve: {
    alias: {
      "@ruleradar/shared": fileURLToPath(new URL("./packages/shared/src/index.ts", import.meta.url)),
      "@ruleradar/db": fileURLToPath(new URL("./packages/db/src/index.ts", import.meta.url)),
      "@ruleradar/monitoring": fileURLToPath(new URL("./packages/monitoring/src/index.ts", import.meta.url)),
      "@ruleradar/ai": fileURLToPath(new URL("./packages/ai/src/index.ts", import.meta.url)),
      "@ruleradar/notifications": fileURLToPath(new URL("./packages/notifications/src/index.ts", import.meta.url))
    }
  }
});
