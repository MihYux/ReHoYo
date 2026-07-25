import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: { include: ["scripts/search-providers.live.ts"], testTimeout: 120_000, hookTimeout: 120_000, maxWorkers: 1 },
});
