/**
 * Tests for --model flag in `specrunner request review`.
 *
 * TC-RVW-MDL-001: --model <name> is parsed and normalized to model: <name>
 * TC-RVW-MDL-002: no --model is normalized to model: undefined
 * TC-RVW-MDL-003: --model "" (empty string) is normalized to model: undefined
 * TC-RVW-MDL-004: --model flag is accepted by flag parser without "Unknown flag" error
 *
 * Strategy: Test the CLI layer by:
 *   1. Using parseFlags + the review subcommand's flag definitions to verify that
 *      --model values are correctly parsed from CLI args.
 *   2. Applying the exact same normalization logic (copy of handler code) to verify
 *      empty-string normalization.
 *   3. These cover "受理" and "空値正規化". "透過" (model → executeReview) is covered
 *      by TC-RVR-011b (runReview modelOverride) and TC-OSQ-07 (queryOneShot modelOverride).
 *
 * Note: Mocking executeReview via vi.mock() in forks pool + Vite ESM does not intercept
 * static imports in command-registry.ts (live binding snapshots in bundled form). Tests
 * at the unit level (reviewer.test.ts, query-one-shot.test.ts) cover the model propagation.
 */
import { describe, it, expect } from "vitest";
import * as url from "node:url";

// Use this test file's path — it exists on disk and parseFlags doesn't care about content.
const THIS_FILE = url.fileURLToPath(import.meta.url);

/**
 * Helper: apply the same model normalization as the review handler.
 * Copy of the exact expression in command-registry.ts:
 *   const modelFlag = parsed.flags["model"];
 *   const model = typeof modelFlag === "string" && modelFlag.trim() !== "" ? modelFlag : undefined;
 */
function normalizeModel(modelFlag: string | boolean | undefined): string | undefined {
  return typeof modelFlag === "string" && modelFlag.trim() !== "" ? modelFlag : undefined;
}

// ---------------------------------------------------------------------------
// TC-RVW-MDL-001: --model <name> → model = <name>
// ---------------------------------------------------------------------------
describe("TC-RVW-MDL-001: --model <name> is parsed and passed to executeReview as model", () => {
  it("parseFlags extracts --model value correctly", async () => {
    const { parseFlags } = await import("../../../src/cli/flag-parser.js");
    const { COMMANDS } = await import("../../../src/cli/command-registry.js");
    const reviewEntry = (COMMANDS["request"] as import("../../../src/cli/command-registry.js").ParentCommandDef).subcommands["review"]!;

    const parsed = parseFlags(
      ["--model", "claude-opus-4-8[1m]", THIS_FILE],
      reviewEntry.flags,
      reviewEntry.positional,
    );

    expect(parsed.flags["model"]).toBe("claude-opus-4-8[1m]");
    expect(normalizeModel(parsed.flags["model"])).toBe("claude-opus-4-8[1m]");
  });

  it("--model=<name> assignment form is also accepted", async () => {
    const { parseFlags } = await import("../../../src/cli/flag-parser.js");
    const { COMMANDS } = await import("../../../src/cli/command-registry.js");
    const reviewEntry = (COMMANDS["request"] as import("../../../src/cli/command-registry.js").ParentCommandDef).subcommands["review"]!;

    const parsed = parseFlags(
      ["--model=claude-opus-4-8[1m]", THIS_FILE],
      reviewEntry.flags,
      reviewEntry.positional,
    );

    expect(parsed.flags["model"]).toBe("claude-opus-4-8[1m]");
    expect(normalizeModel(parsed.flags["model"])).toBe("claude-opus-4-8[1m]");
  });
});

// ---------------------------------------------------------------------------
// TC-RVW-MDL-002: no --model → model = undefined
// ---------------------------------------------------------------------------
describe("TC-RVW-MDL-002: no --model produces model: undefined", () => {
  it("model flag is absent when --model is not specified", async () => {
    const { parseFlags } = await import("../../../src/cli/flag-parser.js");
    const { COMMANDS } = await import("../../../src/cli/command-registry.js");
    const reviewEntry = (COMMANDS["request"] as import("../../../src/cli/command-registry.js").ParentCommandDef).subcommands["review"]!;

    const parsed = parseFlags(
      [THIS_FILE],
      reviewEntry.flags,
      reviewEntry.positional,
    );

    expect(parsed.flags["model"]).toBeUndefined();
    expect(normalizeModel(parsed.flags["model"])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-RVW-MDL-003: --model "" → model = undefined
// ---------------------------------------------------------------------------
describe("TC-RVW-MDL-003: --model empty string is normalized to undefined", () => {
  it("normalizeModel('') returns undefined", () => {
    expect(normalizeModel("")).toBeUndefined();
  });

  it("normalizeModel('  ') (whitespace) returns undefined", () => {
    expect(normalizeModel("  ")).toBeUndefined();
  });

  it("parseFlags extracts empty string when --model '' is given", async () => {
    const { parseFlags } = await import("../../../src/cli/flag-parser.js");
    const { COMMANDS } = await import("../../../src/cli/command-registry.js");
    const reviewEntry = (COMMANDS["request"] as import("../../../src/cli/command-registry.js").ParentCommandDef).subcommands["review"]!;

    const parsed = parseFlags(
      ["--model", "", THIS_FILE],
      reviewEntry.flags,
      reviewEntry.positional,
    );

    expect(parsed.flags["model"]).toBe("");
    expect(normalizeModel(parsed.flags["model"])).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-RVW-MDL-004: --model accepted without "Unknown flag" error
// ---------------------------------------------------------------------------
describe("TC-RVW-MDL-004: --model is accepted by the review flag definitions", () => {
  it("parseFlags does not throw for --model flag", async () => {
    const { parseFlags, FlagParseError } = await import("../../../src/cli/flag-parser.js");
    const { COMMANDS } = await import("../../../src/cli/command-registry.js");
    const reviewEntry = (COMMANDS["request"] as import("../../../src/cli/command-registry.js").ParentCommandDef).subcommands["review"]!;

    expect(() =>
      parseFlags(
        ["--model", "claude-opus-4-8[1m]", THIS_FILE],
        reviewEntry.flags,
        reviewEntry.positional,
      )
    ).not.toThrow(FlagParseError);
  });

  it("review flags definition includes model: string", async () => {
    const { COMMANDS } = await import("../../../src/cli/command-registry.js");
    const reviewEntry = (COMMANDS["request"] as import("../../../src/cli/command-registry.js").ParentCommandDef).subcommands["review"]!;

    expect(reviewEntry.flags["model"]).toEqual({ type: "string" });
  });
});
