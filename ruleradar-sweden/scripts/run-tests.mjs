import { fileURLToPath } from "node:url";
import { startVitest } from "vitest/node";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));

await startVitest("test", [], {
  root,
  config: false,
  watch: false,
  environment: "node",
  include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
  alias: {
    "@ruleradar/shared": source("packages/shared/src/index.ts"),
    "@ruleradar/db": source("packages/db/src/index.ts"),
    "@ruleradar/monitoring": source("packages/monitoring/src/index.ts"),
    "@ruleradar/ai": source("packages/ai/src/index.ts"),
    "@ruleradar/notifications": source("packages/notifications/src/index.ts")
  }
});
