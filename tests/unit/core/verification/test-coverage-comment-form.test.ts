/**
 * Fixture tests for TC-ID traceability comment form in test-coverage evaluation.
 *
 * These are characterization tests that verify the existing test-coverage implementation
 * already handles the comment-form TC-ID correctly. They are placed in a separate file
 * to avoid modifying the existing test-coverage.test.ts.
 *
 * TC-004: コメント形式のみの TC-ID + 同一ファイルに assertion → passed
 * TC-005: コメント形式のみの TC-ID で assertion が皆無 → failed（境界の明示）
 *
 * Source: spec.md > Requirement: test-coverage はコメント形式のみで出現する TC-ID を充足として扱う
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { runTestCoveragePhase } from "../../../../src/core/verification/test-coverage.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-comment-form-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function writeTestCasesMd(slug: string, content: string): Promise<void> {
  const dir = path.join(tempDir, "specrunner", "changes", slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "test-cases.md"), content, "utf-8");
}

async function writeTestFile(relPath: string, content: string): Promise<void> {
  const full = path.join(tempDir, relPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, "utf-8");
}

// ---------------------------------------------------------------------------
// TC-004: コメント形式のみの TC-ID + 同一ファイルに assertion → passed
//
// Given: A test-cases.md declaring a must TC
// And:   The TC-ID appears ONLY as a `// TC-0XX: <name>` traceability comment
//        (not in it() / describe() etc.) in a test file that also has assertions
// When:  test-coverage is evaluated
// Then:  status is passed, TC is in foundTcIds, missingTcIds and assertionlessTcIds are empty
// ---------------------------------------------------------------------------

describe("TC-004: コメント形式のみの TC-ID + 同一ファイルに assertion → passed", () => {
  it("// TC-XXX: コメントのみで TC-ID が出現し、同ファイルに expect() がある → status: 'passed'", async () => {
    const slug = "comment-form-change";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-099: Pre-existing behavior verified by existing test
**Priority**: must
`,
    );
    // TC-099 appears ONLY as a traceability comment, not in it() or describe().
    // The file has pre-existing assertions for other behavior.
    await writeTestFile(
      "tests/unit/existing-behavior.test.ts",
      [
        "import { describe, it, expect } from 'vitest';",
        "",
        "// TC-099: Pre-existing behavior verified by existing test",
        "describe('existing behavior', () => {",
        "  it('does the thing correctly', () => {",
        "    expect(1 + 1).toBe(2);",
        "  });",
        "",
        "  it('handles edge case', () => {",
        "    expect(true).toBe(true);",
        "  });",
        "});",
      ].join("\n"),
    );

    const result = await runTestCoveragePhase(slug, tempDir);

    expect(result.status).toBe("passed");
    expect(result.foundTcIds).toContain("TC-099");
    expect(result.missingTcIds).toEqual([]);
    expect(result.assertionlessTcIds).toEqual([]);
  });

  it("// TC-XXX コメント（コロンなし形式）でも TC-ID が found になり、assertion ありなら passed", async () => {
    const slug = "comment-nocolon";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-088: Another pre-existing scenario
**Priority**: must
`,
    );
    // Traceability comment without a colon suffix
    await writeTestFile(
      "tests/unit/another.test.ts",
      [
        "// TC-088 traceability: pre-existing test covers this",
        "it('another existing test', () => {",
        "  expect('hello').toBe('hello');",
        "});",
      ].join("\n"),
    );

    const result = await runTestCoveragePhase(slug, tempDir);

    expect(result.status).toBe("passed");
    expect(result.foundTcIds).toContain("TC-088");
    expect(result.missingTcIds).toEqual([]);
    expect(result.assertionlessTcIds).toEqual([]);
  });

  it("複数 must TC がコメント形式のみで出現し、全ファイルに assertion がある → status: 'passed'", async () => {
    const slug = "multi-comment-form";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-071: First pre-existing scenario
**Priority**: must

### TC-072: Second pre-existing scenario
**Priority**: must
`,
    );
    // Both TC-IDs appear as traceability comments in a file with assertions
    await writeTestFile(
      "tests/unit/preexisting.test.ts",
      [
        "import { it, expect } from 'vitest';",
        "",
        "// TC-071: First pre-existing scenario",
        "// TC-072: Second pre-existing scenario",
        "it('covers both TC-071 and TC-072 behaviors', () => {",
        "  expect(true).toBe(true);",
        "  expect(2 + 2).toBe(4);",
        "});",
      ].join("\n"),
    );

    const result = await runTestCoveragePhase(slug, tempDir);

    expect(result.status).toBe("passed");
    expect(result.foundTcIds).toContain("TC-071");
    expect(result.foundTcIds).toContain("TC-072");
    expect(result.missingTcIds).toEqual([]);
    expect(result.assertionlessTcIds).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-005: コメント形式のみの TC-ID で assertion が皆無 → failed（境界の明示）
//
// Given: A test-cases.md declaring a must TC
// And:   The TC-ID appears ONLY as a `// TC-0XX: ...` comment in a file with NO assertions
// When:  test-coverage is evaluated
// Then:  status is failed, TC is in assertionlessTcIds
// ---------------------------------------------------------------------------

describe("TC-005: コメント形式のみの TC-ID で assertion が皆無 → failed（境界の明示）", () => {
  it("// TC-XXX: コメントのみで TC-ID が出現し、ファイル内に assertion が皆無 → status: 'failed', assertionlessTcIds に含まれる", async () => {
    const slug = "comment-no-assertion";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-055: Scenario that must not be asserted
**Priority**: must
`,
    );
    // TC-055 appears as traceability comment but there are NO assertions in the file
    await writeTestFile(
      "tests/unit/no-assertion.test.ts",
      [
        "// TC-055: Scenario that must not be asserted",
        "// This file has only comments, no actual test bodies with assertions",
        "it('placeholder — no assertion', () => {",
        "  // TODO: add assertion",
        "});",
      ].join("\n"),
    );

    const result = await runTestCoveragePhase(slug, tempDir);

    expect(result.status).toBe("failed");
    expect(result.assertionlessTcIds).toContain("TC-055");
    expect(result.foundTcIds).toContain("TC-055");
    expect(result.missingTcIds).toEqual([]);
  });

  it("コメント形式 TC-ID のみ + assertion 無しファイル → stdout に 'Assertionless:' が含まれる", async () => {
    const slug = "comment-no-assertion-stdout";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-056: No assertion boundary
**Priority**: must
`,
    );
    await writeTestFile(
      "tests/unit/empty-stub.test.ts",
      "// TC-056: No assertion boundary\nit('stub', () => {});\n",
    );

    const result = await runTestCoveragePhase(slug, tempDir);

    expect(result.stdout).toContain("Assertionless:");
    expect(result.stdout).toContain("TC-056");
  });

  it("コメント形式 TC-ID + assertion なしファイル と assertion ありファイルが共存 → assertion あり側が勝つ → passed", async () => {
    // This tests the per-TC assertion check: if ANY file with the TC-ID has an assertion,
    // the TC is NOT assertionless. Traceability comment can appear in multiple files.
    const slug = "comment-dual-files";
    await writeTestCasesMd(
      slug,
      `# Test Cases

### TC-057: Dual-file traceability
**Priority**: must
`,
    );
    // File 1: only comment, no assertion
    await writeTestFile(
      "tests/unit/stub-file.test.ts",
      "// TC-057: Dual-file traceability\nit('stub', () => {});\n",
    );
    // File 2: comment + real assertion
    await writeTestFile(
      "tests/unit/real-file.test.ts",
      [
        "// TC-057: Dual-file traceability",
        "it('real assertion', () => { expect(42).toBe(42); });",
      ].join("\n"),
    );

    const result = await runTestCoveragePhase(slug, tempDir);

    expect(result.status).toBe("passed");
    expect(result.assertionlessTcIds).not.toContain("TC-057");
    expect(result.foundTcIds).toContain("TC-057");
  });
});
