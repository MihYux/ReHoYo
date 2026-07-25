import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    exclude: [
      "tests/e2e/**",
      "node_modules/**",
      ".next/**",
      ".packaging/**",
      "dist-electron/**",
      "release/**",
      "desktop-march7th/**",
    ],
    coverage: { reporter: ["text", "html"] },
  },
});
