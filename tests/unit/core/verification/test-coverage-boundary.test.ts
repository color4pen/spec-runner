/**
 * Unit tests for TC-ID boundary matching (T-07).
 *
 * TC-TCB-01: TC-1 not found when only TC-10 present → missing
 * TC-TCB-02: TC-1 found when TC-1 present at boundary → found
 * TC-TCB-03: TC-1 not found when only TC-1-2 (hierarchical child) present → missing
 * TC-TCB-04: TC-10 found when TC-10 present explicitly → found
 * TC-TCB-05: TC-1 and TC-10 both in file as separate words → TC-1 found, TC-10 found independently
 * TC-TCB-06: TC-1 at start of string → found
 * TC-TCB-07: TC-1 at end of string → found
 * TC-TCB-08: TC-1 with non-alphanumeric neighbors → found
 * TC-TCB-09: assertionless check also uses boundary matching
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { runTestCoveragePhase } from "../../../../src/core/verification/test-coverage.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tc-boundary-test-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

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

const TEST_CASES_SINGLE = `# Test Cases

## TC-1: First test
**Priority**: must
`;

const TEST_CASES_WITH_TC10 = `# Test Cases

## TC-10: Tenth test
**Priority**: must
`;

// ---------------------------------------------------------------------------
// TC-TCB-01: TC-1 not found when only TC-10 present → missing
// ---------------------------------------------------------------------------

describe("TC-TCB-01: must TC-1, only TC-10 in file → TC-1 is missing", () => {
  it("TC-10 alone does not satisfy TC-1 requirement", async () => {
    const slug = "boundary-test";
    await writeTestCasesMd(slug, TEST_CASES_SINGLE);

    // Test file contains TC-10 but NOT TC-1 as an isolated token
    await writeTestFile(
      "tests/foo.test.ts",
      `
// TC-10: covers the tenth case
it("TC-10 test", () => { expect(true).toBe(true); });
`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.status).toBe("failed");
    expect(result.missingTcIds).toContain("TC-1");
  });
});

// ---------------------------------------------------------------------------
// TC-TCB-02: TC-1 found when TC-1 present at boundary → found
// ---------------------------------------------------------------------------

describe("TC-TCB-02: must TC-1, TC-1 explicitly present → found", () => {
  it("TC-1 at word boundary is detected correctly", async () => {
    const slug = "boundary-test-found";
    await writeTestCasesMd(slug, TEST_CASES_SINGLE);

    await writeTestFile(
      "tests/foo.test.ts",
      `
// TC-1: basic test
it("TC-1 test case", () => { expect(1).toBe(1); });
`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.status).toBe("passed");
    expect(result.foundTcIds).toContain("TC-1");
    expect(result.missingTcIds).not.toContain("TC-1");
  });
});

// ---------------------------------------------------------------------------
// TC-TCB-03: TC-1 not found when only TC-1-2 (hierarchical child) present → missing
// ---------------------------------------------------------------------------

describe("TC-TCB-03: must TC-1, only TC-1-2 in file → TC-1 is missing", () => {
  it("TC-1-2 does not satisfy TC-1 requirement", async () => {
    const slug = "boundary-hierarchical";
    await writeTestCasesMd(slug, TEST_CASES_SINGLE);

    await writeTestFile(
      "tests/foo.test.ts",
      `
// TC-1-2: subtask test
it("TC-1-2 subtask", () => { expect(true).toBe(true); });
`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.status).toBe("failed");
    expect(result.missingTcIds).toContain("TC-1");
  });
});

// ---------------------------------------------------------------------------
// TC-TCB-04: TC-10 found when TC-10 present explicitly → found
// ---------------------------------------------------------------------------

describe("TC-TCB-04: must TC-10, TC-10 explicitly present → found", () => {
  it("TC-10 with assertion → found (not confused by TC-1 boundary rule)", async () => {
    const slug = "boundary-tc10";
    await writeTestCasesMd(slug, TEST_CASES_WITH_TC10);

    await writeTestFile(
      "tests/foo.test.ts",
      `
// TC-10: tenth test
it("TC-10 should work", () => { expect(10).toBe(10); });
`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.status).toBe("passed");
    expect(result.foundTcIds).toContain("TC-10");
  });
});

// ---------------------------------------------------------------------------
// TC-TCB-05: TC-1 and TC-10 both in file as separate tokens
// ---------------------------------------------------------------------------

describe("TC-TCB-05: TC-1 and TC-10 both in file → each detected independently", () => {
  it("must TCs TC-1 and TC-10 both found when both present", async () => {
    const slug = "boundary-both";
    await writeTestCasesMd(
      slug,
      `# Test Cases

## TC-1: First
**Priority**: must

## TC-10: Tenth
**Priority**: must
`,
    );

    await writeTestFile(
      "tests/foo.test.ts",
      `
// TC-1: first test
it("TC-1 case", () => { expect(1).toBe(1); });
// TC-10: tenth test
it("TC-10 case", () => { expect(10).toBe(10); });
`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.status).toBe("passed");
    expect(result.foundTcIds).toContain("TC-1");
    expect(result.foundTcIds).toContain("TC-10");
  });
});

// ---------------------------------------------------------------------------
// TC-TCB-06: TC-1 at start of string → found
// ---------------------------------------------------------------------------

describe("TC-TCB-06: TC-1 at start of string → found", () => {
  it("TC-1 at position 0 without preceding chars → detected", async () => {
    const slug = "boundary-start";
    await writeTestCasesMd(slug, TEST_CASES_SINGLE);

    await writeTestFile(
      "tests/foo.test.ts",
      `TC-1 is the first case\nit("test", () => { expect(true).toBe(true); });\n`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.foundTcIds).toContain("TC-1");
  });
});

// ---------------------------------------------------------------------------
// TC-TCB-07: TC-1 at end of line → found
// ---------------------------------------------------------------------------

describe("TC-TCB-07: TC-1 at end of string → found", () => {
  it("TC-1 with no trailing chars → detected", async () => {
    const slug = "boundary-end";
    await writeTestCasesMd(slug, TEST_CASES_SINGLE);

    await writeTestFile(
      "tests/foo.test.ts",
      `it("covers TC-1", () => { expect(true).toBe(true); });\n`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.foundTcIds).toContain("TC-1");
  });
});

// ---------------------------------------------------------------------------
// TC-TCB-08: TC-1 with non-alphanumeric neighbors → found
// ---------------------------------------------------------------------------

describe("TC-TCB-08: TC-1 with punctuation neighbors → found", () => {
  it("TC-1: (colon) and TC-1, (comma) neighbors are valid boundaries", async () => {
    const slug = "boundary-punct";
    await writeTestCasesMd(slug, TEST_CASES_SINGLE);

    await writeTestFile(
      "tests/foo.test.ts",
      `// Covers TC-1: the first requirement, TC-1 verified.\nit("test", () => { expect(1).toBe(1); });\n`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    expect(result.foundTcIds).toContain("TC-1");
  });
});

// ---------------------------------------------------------------------------
// TC-TCB-09: assertionless check also uses boundary matching
// ---------------------------------------------------------------------------

describe("TC-TCB-09: assertionless check uses boundary matching for TC-1 vs TC-10", () => {
  it("TC-1 file has TC-10 but not TC-1 → assertionless check treats TC-1 as not present", async () => {
    const slug = "assertionless-boundary";
    await writeTestCasesMd(slug, TEST_CASES_SINGLE);

    // File mentions TC-10 with an expect, but TC-1 is not matched
    await writeTestFile(
      "tests/foo.test.ts",
      `
// Only TC-10 here
it("TC-10 test", () => { expect(10).toBe(10); });
`,
    );

    const result = await runTestCoveragePhase(slug, tempDir);
    // TC-1 should be missing (not found), not found → not in assertionless list
    expect(result.missingTcIds).toContain("TC-1");
    expect(result.assertionlessTcIds).not.toContain("TC-1");
  });
});
