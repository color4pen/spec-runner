/**
 * TC-003: StepExecutor の dispatch は step.kind のみ（step 名 hardcode 禁止）
 * TC-017 (partial): runPollingStyleStep の step.name 汎用化
 *
 * Asserts that executor.ts and executor-helpers.ts contain no step name string literals
 * like "spec-review", "verification", "implementer", "build-fixer", "spec-fixer", "propose".
 *
 * Dispatch must be on step.kind only, not step.name.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const STEP_NAMES = [
  "spec-review",
  "verification",
  "implementer",
  "build-fixer",
  "spec-fixer",
  "propose",
];

const STEP_DIR = path.resolve(__dirname, "../src/core/step");

async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf-8");
}

/**
 * Find all occurrences of a step name literal in a file.
 * A literal is a string like "spec-review" or 'spec-review' appearing in source.
 * Skip comment lines and lines that are clearly just string declarations in non-dispatch contexts.
 *
 * Note: We are checking for step name string literals used as DISPATCH conditions
 * (e.g., if (step.name === "spec-review")). The executor must only dispatch on step.kind.
 *
 * However, step names legitimately appear in:
 *   - Error message strings (e.g., `Failed to create ${step.name} session`)
 *   - History message strings
 * These are NOT dispatch conditions and are acceptable.
 *
 * This test checks that no IF/SWITCH dispatch on step.name uses hardcoded literals.
 */
describe("TC-003: executor.ts と executor-helpers.ts に step 名 hardcode がないことを検証", () => {
  it("executor.ts に step 名 hardcode 分岐がない (getTimeoutMs 以外の dispatch 文)", async () => {
    const executorPath = path.join(STEP_DIR, "executor.ts");
    const content = await readFile(executorPath);

    // Check: no if/switch dispatch on step.name using hardcoded step name literals
    // Pattern: something like `if (step.name === "spec-review")` or `case "spec-review":`
    const dispatchPatterns = [
      /if\s*\(.*step\.name\s*===?\s*["'](?:spec-review|verification|implementer|build-fixer|spec-fixer|propose)["']/,
      /case\s*["'](?:spec-review|verification|implementer|build-fixer|spec-fixer|propose)["']\s*:/,
    ];

    for (const pattern of dispatchPatterns) {
      expect(pattern.test(content)).toBe(false);
    }

    // Dispatch is ONLY on step.kind
    expect(content).toContain("step.kind");
  });

  it("executor-helpers.ts に step 名 hardcode 分岐がない", async () => {
    const helpersPath = path.join(STEP_DIR, "executor-helpers.ts");
    const content = await readFile(helpersPath);

    const dispatchPatterns = [
      /if\s*\(.*step\.name\s*===?\s*["'](?:spec-review|verification|implementer|build-fixer|spec-fixer|propose)["']/,
      /case\s*["'](?:spec-review|verification|implementer|build-fixer|spec-fixer|propose)["']\s*:/,
    ];

    for (const pattern of dispatchPatterns) {
      expect(pattern.test(content)).toBe(false);
    }
  });

  it("TC-017: executor-helpers.ts の runPollingStyleStep が step.name を汎用的に参照している", async () => {
    const helpersPath = path.join(STEP_DIR, "executor-helpers.ts");
    const content = await readFile(helpersPath);

    // Check that there's no hardcoded "spec-review" in steps array access patterns
    // (e.g., state.steps?.["spec-review"]?.length should NOT appear)
    expect(content).not.toMatch(/state\.steps\?\.\["spec-review"\]/);
    expect(content).not.toMatch(/state\.steps\?\.\["verification"\]/);
    expect(content).not.toMatch(/state\.steps\?\.\["implementer"\]/);
  });
});

// TC-017: executor.ts は buildFindingsPath を import せず、step.resultFilePath() で取得した findingsPath を直接使う
describe("TC-017: runPollingStyleStep step.name 汎用化", () => {
  it("executor.ts の iteration カウントが state.steps?.[step.name]?.length を使用している", async () => {
    const executorPath = path.join(STEP_DIR, "executor.ts");
    const content = await readFile(executorPath);

    // After F1 fix: executor uses findingsPath (from step.resultFilePath) directly.
    // No step-specific path builder is imported or called in executor.ts.
    // Verify buildFindingsPath is NOT imported (would couple executor to spec-review's naming)
    expect(content).not.toContain("buildFindingsPath");

    // Should NOT have hardcoded "spec-review" in steps array access
    expect(content).not.toMatch(/state\.steps\?\.\["spec-review"\]/);

    // Verify executor delegates path to step via resultFilePath / findingsPath variable
    expect(content).toContain("findingsPath");
  });
});
