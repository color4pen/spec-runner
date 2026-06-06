import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts", "tests/**/*.test.ts"],
    pool: "forks",
    maxWorkers: 4,
    globalSetup: "./tests/global-setup.ts",
  },
});
