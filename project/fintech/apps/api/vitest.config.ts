import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts", "src/**/*.spec.ts"],
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 10_000,
  },
});
