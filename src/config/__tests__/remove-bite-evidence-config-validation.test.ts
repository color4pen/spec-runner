/**
 * T-13 regression: verification.scopedTestCommand / scopedTestPatterns silently ignored.
 *
 * TC-041: verification.scopedTestCommand / scopedTestPatterns silently ignored (design D7)
 *
 * Note: archive.minimumAssurance.biteEvidence → CONFIG_INVALID is covered by
 * tests/unit/config/schema-minimum-assurance.test.ts (TC-038).
 *
 * Source: remove-bite-evidence spec (T-07 acceptance criteria)
 *   "scopedTestCommand and scopedTestPatterns are absent from the config types and schema,
 *    and a config still containing them validates successfully with no effect."
 */
import { describe, it, expect } from "vitest";
import { validateConfig } from "../schema.js";

// ---------------------------------------------------------------------------
// TC-041: verification.scopedTestCommand / scopedTestPatterns silently ignored
//
// Design D7: leftover keys are intentionally ignored (not validated, not rejected).
// A config that was written before bite-evidence removal still containing these
// keys must not fail validation with CONFIG_INVALID or any other error.
// ---------------------------------------------------------------------------

describe("TC-041: verification.scopedTestCommand / scopedTestPatterns silently ignored (design D7)", () => {
  it("TC-041: verification.scopedTestCommand retained in old config → validates (no error)", () => {
    expect(() =>
      validateConfig({
        version: 1,
        agents: {},
        verification: {
          scopedTestCommand: "bun test",
        },
      } as never),
    ).not.toThrow();
  });

  it("TC-041: verification.scopedTestPatterns retained in old config → validates (no error)", () => {
    expect(() =>
      validateConfig({
        version: 1,
        agents: {},
        verification: {
          scopedTestPatterns: ["**/*.test.ts"],
        },
      } as never),
    ).not.toThrow();
  });

  it("TC-041: both scopedTestCommand and scopedTestPatterns → validates (no error)", () => {
    expect(() =>
      validateConfig({
        version: 1,
        agents: {},
        verification: {
          scopedTestCommand: "bun test",
          scopedTestPatterns: ["**/*.test.ts", "**/*.spec.ts"],
        },
      } as never),
    ).not.toThrow();
  });

  it("TC-041: scopedTestCommand alongside valid verification.commands → validates", () => {
    expect(() =>
      validateConfig({
        version: 1,
        agents: {},
        verification: {
          commands: [{ run: "bun run typecheck" }],
          scopedTestCommand: "bun test",
        },
      } as never),
    ).not.toThrow();
  });
});
