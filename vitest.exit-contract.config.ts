/**
 * Dedicated vitest config for regenerating the CLI exit contract base fixture.
 *
 *   bun run exit-contract:generate
 *
 * It reuses the main config but replaces `include` with the standalone
 * generator (a `.gen.ts` file the normal suite never discovers), so
 * `bun run test` can never rewrite src/cli/__tests__/fixtures/cli-exit-contract.base.json.
 */
import { defineConfig } from "vitest/config";
import base from "./vitest.config.js";

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["src/cli/__tests__/exit-contract-generate.gen.ts"],
  },
});
