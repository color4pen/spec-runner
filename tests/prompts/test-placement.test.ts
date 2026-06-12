/**
 * Tests for implementer message placement injection and renderTestPlacementInstruction.
 *
 * TC-006: sibling placement appears in the implementer message
 * TC-007: mirror placement appears in the implementer message
 * TC-008: custom suffix overrides the default
 * TC-009: implementer message has no placement section when unset
 * TC-010: test-case-gen prompt never mentions placement
 * TC-014: mirror で sourceRoot 省略時のメッセージにソース完全パスが含まれる
 * TC-015: IMPLEMENTER_SYSTEM_PROMPT が変更されていない
 */
import { describe, it, expect } from "vitest";
import { renderTestPlacementInstruction } from "../../src/prompts/test-placement.js";
import { buildImplementerInitialMessage } from "../../src/core/step/implementer.js";
import { IMPLEMENTER_SYSTEM_PROMPT } from "../../src/prompts/implementer-system.js";
import { TEST_CASE_GEN_SYSTEM_PROMPT } from "../../src/prompts/test-case-gen-system.js";

// ---------------------------------------------------------------------------
// renderTestPlacementInstruction unit tests
// ---------------------------------------------------------------------------

// TC-006: sibling placement appears in the implementer message
describe("TC-006: renderTestPlacementInstruction — sibling", () => {
  it("returns a '## Test File Placement' section", () => {
    const result = renderTestPlacementInstruction({ style: "sibling" });
    expect(result).toContain("## Test File Placement");
  });

  it("mentions same directory placement for sibling", () => {
    const result = renderTestPlacementInstruction({ style: "sibling" });
    expect(result).toContain("same directory");
  });

  it("uses default .test.ts suffix when suffix is absent", () => {
    const result = renderTestPlacementInstruction({ style: "sibling" });
    expect(result).toContain(".test.ts");
  });

  it("includes a before→after example for sibling", () => {
    const result = renderTestPlacementInstruction({ style: "sibling" });
    // Example should show src/foo/bar.ts → src/foo/bar.test.ts
    expect(result).toContain("src/foo/bar.ts");
    expect(result).toContain("src/foo/bar.test.ts");
  });

  it("states directive overrides the default guidance", () => {
    const result = renderTestPlacementInstruction({ style: "sibling" });
    expect(result).toContain("overrides");
  });
});

// TC-007: mirror placement appears in the implementer message
describe("TC-007: renderTestPlacementInstruction — mirror with sourceRoot", () => {
  it("returns a '## Test File Placement' section", () => {
    const result = renderTestPlacementInstruction({
      style: "mirror",
      testsRoot: "tests",
      sourceRoot: "src",
    });
    expect(result).toContain("## Test File Placement");
  });

  it("references the testsRoot value", () => {
    const result = renderTestPlacementInstruction({
      style: "mirror",
      testsRoot: "tests",
      sourceRoot: "src",
    });
    expect(result).toContain("tests/");
  });

  it("includes a before→after mapping example showing source mirrored under testsRoot", () => {
    const result = renderTestPlacementInstruction({
      style: "mirror",
      testsRoot: "tests",
      sourceRoot: "src",
    });
    // Example: src/foo/bar.ts → tests/foo/bar.test.ts
    expect(result).toContain("src/foo/bar.ts");
    expect(result).toContain("tests/foo/bar.test.ts");
  });

  it("states directive overrides the default guidance", () => {
    const result = renderTestPlacementInstruction({
      style: "mirror",
      testsRoot: "tests",
      sourceRoot: "src",
    });
    expect(result).toContain("overrides");
  });
});

// TC-014: mirror で sourceRoot 省略時のメッセージにソース完全パスが含まれる
describe("TC-014: renderTestPlacementInstruction — mirror without sourceRoot", () => {
  it("preserves full source path under testsRoot when sourceRoot is absent", () => {
    const result = renderTestPlacementInstruction({
      style: "mirror",
      testsRoot: "tests",
    });
    // Example: src/foo/bar.ts → tests/src/foo/bar.test.ts
    expect(result).toContain("tests/");
    expect(result).toContain("src/foo/bar.ts");
    expect(result).toContain("tests/src/foo/bar.test.ts");
  });
});

// TC-008: custom suffix overrides the default
describe("TC-008: renderTestPlacementInstruction — custom suffix", () => {
  it("uses custom suffix .spec.ts when specified for sibling", () => {
    const result = renderTestPlacementInstruction({ style: "sibling", suffix: ".spec.ts" });
    expect(result).toContain(".spec.ts");
    expect(result).not.toContain(".test.ts");
  });

  it("uses custom suffix .spec.ts when specified for mirror", () => {
    const result = renderTestPlacementInstruction({
      style: "mirror",
      testsRoot: "tests",
      sourceRoot: "src",
      suffix: ".spec.ts",
    });
    expect(result).toContain(".spec.ts");
    expect(result).not.toContain(".test.ts");
  });

  it("uses suffix in example paths for sibling", () => {
    const result = renderTestPlacementInstruction({ style: "sibling", suffix: ".spec.ts" });
    // Example should contain bar.spec.ts
    expect(result).toContain("bar.spec.ts");
  });
});

// ---------------------------------------------------------------------------
// buildImplementerInitialMessage injection tests
// ---------------------------------------------------------------------------

const BASE_OPTS = {
  slug: "my-change",
  branch: "feat/my-change-abc123",
  requestContent: "# Request\nDo something.",
};

// TC-006 (message level): sibling placement section in message
describe("TC-006: buildImplementerInitialMessage — sibling placement injected", () => {
  it("message contains '## Test File Placement' section when placement is sibling", () => {
    const msg = buildImplementerInitialMessage({
      ...BASE_OPTS,
      placement: { style: "sibling" },
    });
    expect(msg).toContain("## Test File Placement");
  });

  it("message contains same-directory instruction", () => {
    const msg = buildImplementerInitialMessage({
      ...BASE_OPTS,
      placement: { style: "sibling" },
    });
    expect(msg).toContain("same directory");
  });

  it("message contains .test.ts suffix", () => {
    const msg = buildImplementerInitialMessage({
      ...BASE_OPTS,
      placement: { style: "sibling" },
    });
    expect(msg).toContain(".test.ts");
  });
});

// TC-007 (message level): mirror placement section in message
describe("TC-007: buildImplementerInitialMessage — mirror placement injected", () => {
  it("message contains '## Test File Placement' section when placement is mirror", () => {
    const msg = buildImplementerInitialMessage({
      ...BASE_OPTS,
      placement: { style: "mirror", testsRoot: "tests", sourceRoot: "src" },
    });
    expect(msg).toContain("## Test File Placement");
  });

  it("message contains testsRoot reference", () => {
    const msg = buildImplementerInitialMessage({
      ...BASE_OPTS,
      placement: { style: "mirror", testsRoot: "tests", sourceRoot: "src" },
    });
    expect(msg).toContain("tests/");
  });

  it("message contains before→after example", () => {
    const msg = buildImplementerInitialMessage({
      ...BASE_OPTS,
      placement: { style: "mirror", testsRoot: "tests", sourceRoot: "src" },
    });
    expect(msg).toContain("tests/foo/bar.test.ts");
  });
});

// TC-009: no placement section when unset
describe("TC-009: buildImplementerInitialMessage — no placement section when unset", () => {
  it("message does not contain '## Test File Placement' when placement is absent", () => {
    const msg = buildImplementerInitialMessage(BASE_OPTS);
    expect(msg).not.toContain("## Test File Placement");
  });

  it("message without placement is identical to message with placement=undefined", () => {
    const msg1 = buildImplementerInitialMessage(BASE_OPTS);
    const msg2 = buildImplementerInitialMessage({ ...BASE_OPTS, placement: undefined });
    expect(msg1).toBe(msg2);
  });
});

// ---------------------------------------------------------------------------
// TC-010: test-case-gen prompt never mentions placement
// ---------------------------------------------------------------------------

describe("TC-010: TEST_CASE_GEN_SYSTEM_PROMPT — no placement mention", () => {
  it("does not contain 'Test File Placement' section", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).not.toContain("## Test File Placement");
  });

  it("does not contain placement directive text", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).not.toContain("testsRoot");
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).not.toContain("sibling");
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).not.toContain("mirrorPlacement");
  });
});

// ---------------------------------------------------------------------------
// TC-015: IMPLEMENTER_SYSTEM_PROMPT is unchanged
// ---------------------------------------------------------------------------

describe("TC-015: IMPLEMENTER_SYSTEM_PROMPT — unchanged (no Test File Placement section)", () => {
  it("does not contain '## Test File Placement' section", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).not.toContain("## Test File Placement");
  });

  it("still contains the 'follow existing test placement pattern' default guidance", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("既存テストの配置パターンに従う");
  });

  it("still contains '特定ディレクトリを指定しない' guidance", () => {
    expect(IMPLEMENTER_SYSTEM_PROMPT).toContain("特定ディレクトリを指定しない");
  });
});
