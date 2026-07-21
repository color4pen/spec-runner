/**
 * TC Source Contract Drift Fix — regression tests.
 *
 * Verifies that:
 * - TC_SOURCE_SCENARIO_FORMAT constant holds the canonical format string (TC-001)
 * - 3 step prompts embed the canonical format value (TC-002, TC-003, TC-004)
 * - consumer prompts do not contain the old specs/<capability>/spec.md format (TC-005, TC-006)
 * - tc-source-contract.ts has no project-internal imports (TC-007)
 *
 * These tests are intentionally red until the implementation (T-01 through T-04) is complete.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { TC_SOURCE_SCENARIO_FORMAT } from "../tc-source-contract.js";
import { TEST_CASE_GEN_SYSTEM_PROMPT } from "../test-case-gen-system.js";
import { TEST_MATERIALIZE_SYSTEM_PROMPT } from "../test-materialize-system.js";
import { IMPLEMENTER_SYSTEM_PROMPT } from "../implementer-system.js";

// ---------------------------------------------------------------------------
// TC-001: 正準形式定数が正しい形式文字列を保持する
// ---------------------------------------------------------------------------

describe("TC-001: TC_SOURCE_SCENARIO_FORMAT constant content", () => {
  it("TC-001: value equals canonical format 'spec.md > Requirement: <name> > Scenario: <name>'", () => {
    expect(TC_SOURCE_SCENARIO_FORMAT).toBe("spec.md > Requirement: <name> > Scenario: <name>");
  });

  it("TC-001: value does not contain 'specs/' (no old-format taint)", () => {
    expect(TC_SOURCE_SCENARIO_FORMAT).not.toContain("specs/");
  });
});

// ---------------------------------------------------------------------------
// TC-002: test-case-gen の Source フィールド説明が正準形式を含む
// ---------------------------------------------------------------------------

describe("TC-002: TEST_CASE_GEN_SYSTEM_PROMPT contains canonical TC source format", () => {
  it("TC-002: TEST_CASE_GEN_SYSTEM_PROMPT contains TC_SOURCE_SCENARIO_FORMAT value", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain(TC_SOURCE_SCENARIO_FORMAT);
  });
});

// ---------------------------------------------------------------------------
// TC-003: test-materialize の Scenario 由来 TC 判別条件が正準形式を含む
// ---------------------------------------------------------------------------

describe("TC-003: TEST_MATERIALIZE_SYSTEM_PROMPT contains canonical TC source format", () => {
  it("TC-003: TEST_MATERIALIZE_SYSTEM_PROMPT contains TC_SOURCE_SCENARIO_FORMAT value", () => {
    expect(TEST_MATERIALIZE_SYSTEM_PROMPT).toContain(TC_SOURCE_SCENARIO_FORMAT);
  });
});

// ---------------------------------------------------------------------------
// TC-004: implementer の Scenario 由来 TC 判別条件が正準形式を含む
// ---------------------------------------------------------------------------

describe("TC-004: IMPLEMENTER_SYSTEM_PROMPT contains canonical TC source format", () => {
  it("TC-004: IMPLEMENTER_SYSTEM_PROMPT contains TC_SOURCE_SCENARIO_FORMAT value", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain(TC_SOURCE_SCENARIO_FORMAT);
  });
});

// ---------------------------------------------------------------------------
// TC-005: test-materialize の Scenario 判別条件に旧形式が存在しない
// ---------------------------------------------------------------------------

describe("TC-005: TEST_MATERIALIZE_SYSTEM_PROMPT does not contain old Scenario path format", () => {
  it("TC-005: TEST_MATERIALIZE_SYSTEM_PROMPT does not contain 'specs/<capability>/spec.md'", () => {
    expect(TEST_MATERIALIZE_SYSTEM_PROMPT).not.toContain("specs/<capability>/spec.md");
  });
});

// ---------------------------------------------------------------------------
// TC-006: implementer の Scenario 判別条件に旧形式が存在しない
// ---------------------------------------------------------------------------

describe("TC-006: IMPLEMENTER_SYSTEM_PROMPT does not contain old Scenario path format", () => {
  it("TC-006: IMPLEMENTER_SYSTEM_PROMPT does not contain 'specs/<capability>/spec.md'", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).not.toContain("specs/<capability>/spec.md");
  });
});

// ---------------------------------------------------------------------------
// TC-007: tc-source-contract.ts が project-internal import を持たない
// ---------------------------------------------------------------------------

describe("TC-007: tc-source-contract.ts has no project-internal imports", () => {
  // Resolve path relative to this test file: __tests__/../tc-source-contract.ts
  const contractFilePath = fileURLToPath(
    new URL("../tc-source-contract.ts", import.meta.url),
  );

  it("TC-007: src/prompts/tc-source-contract.ts exists", () => {
    // readFileSync throws if file does not exist — intentionally red until T-01 is implemented
    const content = readFileSync(contractFilePath, "utf-8");
    expect(content.length).toBeGreaterThan(0);
  });

  it("TC-007: file has no relative project-internal imports (import ... from '../...')", () => {
    const content = readFileSync(contractFilePath, "utf-8");
    const internalImports = content
      .split("\n")
      .filter((line) => /^\s*import\s.+from\s+['"]\.\.\//.test(line));
    expect(internalImports).toHaveLength(0);
  });
});
