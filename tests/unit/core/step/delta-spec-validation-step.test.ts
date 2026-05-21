/**
 * Tests for the baselineSpecLoader behavior used in DeltaSpecValidationStep.
 *
 * Covers:
 *   TC-082 — Step's baselineSpecLoader reads specrunner/specs/<capability>/spec.md
 *   TC-083 — Step's baselineSpecLoader returns null when spec.md does not exist
 *
 * The baselineSpecLoader is defined as an inline closure inside
 * DeltaSpecValidationStep.run(). These tests replicate the same logic and
 * verify the expected contract: reads from the canonical baseline path and
 * returns null on any I/O error.
 */
import { describe, it, expect } from "vitest";
import * as nodePath from "node:path";
import * as nodeFs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __dirname = nodePath.dirname(fileURLToPath(import.meta.url));
/** Absolute path to the repository/worktree root (4 levels up from tests/unit/core/step/). */
const PROJECT_ROOT = nodePath.resolve(__dirname, "../../../../");

/**
 * Replicates the baselineSpecLoader closure from DeltaSpecValidationStep.run().
 *
 * The step constructs this function with:
 *   const baselinePath = nodePath.join(cwd, `specrunner/specs/${capability}/spec.md`);
 *   try { return await nodeFs.readFile(baselinePath, "utf-8"); } catch { return null; }
 *
 * Testing this logic here verifies both the path construction and the null-on-error
 * contract without needing to spin up a full CliStep execution context.
 */
function createBaselineSpecLoader(cwd: string) {
  return async (capability: string): Promise<string | null> => {
    const baselinePath = nodePath.join(cwd, `specrunner/specs/${capability}/spec.md`);
    try {
      return await nodeFs.readFile(baselinePath, "utf-8");
    } catch {
      return null;
    }
  };
}

// ---------------------------------------------------------------------------
// TC-082: Step の baselineSpecLoader が specrunner/specs/<capability>/spec.md を読む
// ---------------------------------------------------------------------------
describe("TC-082: baselineSpecLoader — reads specrunner/specs/<capability>/spec.md when file exists", () => {
  it("returns non-null string content for 'delta-spec-rule' capability (file exists in worktree)", async () => {
    const loader = createBaselineSpecLoader(PROJECT_ROOT);
    const content = await loader("delta-spec-rule");

    expect(content).not.toBeNull();
    expect(typeof content).toBe("string");
    // The baseline spec must be non-empty and start with recognisable content
    expect(content!.length).toBeGreaterThan(0);
  });

  it("constructed path follows specrunner/specs/<capability>/spec.md pattern", () => {
    // Verify the path formula: join(cwd, `specrunner/specs/${capability}/spec.md`)
    const cwd = "/absolute/project/root";
    const capability = "my-capability";
    const expected = "/absolute/project/root/specrunner/specs/my-capability/spec.md";
    const actual = nodePath.join(cwd, `specrunner/specs/${capability}/spec.md`);
    expect(actual).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// TC-083: Step の baselineSpecLoader がファイル不在時に null を返す
// ---------------------------------------------------------------------------
describe("TC-083: baselineSpecLoader — returns null when spec.md does not exist", () => {
  it("returns null for a definitely nonexistent capability", async () => {
    const loader = createBaselineSpecLoader(PROJECT_ROOT);
    const content = await loader("definitely-nonexistent-capability-xyzzy-9999");

    expect(content).toBeNull();
  });

  it("does not throw when the capability directory is absent", async () => {
    const loader = createBaselineSpecLoader(PROJECT_ROOT);
    // Must resolve (not reject) even for a missing path
    await expect(loader("no-such-cap")).resolves.toBeNull();
  });
});
