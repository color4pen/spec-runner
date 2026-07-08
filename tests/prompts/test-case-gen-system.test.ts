import { describe, it, expect } from "vitest";
import {
  TEST_CASE_GEN_SYSTEM_PROMPT,
  buildTestCaseGenInitialMessage,
} from "../../src/prompts/test-case-gen-system.js";

// TC-023: test-case-gen prompt に TC ID の downstream 参照規律が含まれる
describe("TC-023: TEST_CASE_GEN_SYSTEM_PROMPT — TC ID downstream 参照規律", () => {
  it("TC ID が implementer / verification step で grep 参照される旨の規律が含まれる", () => {
    const hasDownstreamRef =
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("implementer") &&
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("grep");
    expect(hasDownstreamRef).toBe(true);
  });

  it("TC ID が一意かつ安定的に grep 可能であることの要件が含まれる", () => {
    const hasUniqueness =
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("unique") ||
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("一意");
    expect(hasUniqueness).toBe(true);
  });
});

describe("TC-CATG-01: e2e category is removed from prompt", () => {
  it("does not contain 'e2e' anywhere in the system prompt", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).not.toContain("e2e");
  });
});

describe("TC-CATG-02: three categories are present", () => {
  it("contains 'unit | integration | manual' category listing", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("unit | integration | manual");
  });
});

describe("TC-CATG-03: LLM/API exclusion rule is present", () => {
  it("contains dogfood verification rule for LLM calls", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("MUST NOT be");
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("dogfood");
  });
});

describe("spec Scenario as primary test source", () => {
  it("system prompt mentions spec Scenarios as primary input source", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("Primary input source");
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("Scenario");
  });

  it("system prompt contains spec.md path reference", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("spec.md");
  });

  it("system prompt contains fallback instruction for spec absent", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("spec absent");
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("fall back");
  });

  it("system prompt positions design.md / tasks.md as supplementary context", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("Supplementary");
  });

  it("Coverage Requirements requires every Scenario to have at least one test case when spec is present", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain(
      "Every Scenario in spec.md must have at least one test case",
    );
  });

  it("Source field description includes spec Scenario reference format", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain(
      "spec.md > Requirement: <name> > Scenario: <name>",
    );
  });

  it("failed result condition covers spec absent AND design artifacts missing", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("spec absent");
  });
});

describe("buildTestCaseGenInitialMessage — spec reading step", () => {
  const msg = buildTestCaseGenInitialMessage({
    slug: "my-change",
    branch: "change/my-change-abc123",
    requestContent: "# Request",
  });

  it("includes a step to read spec.md for Scenarios", () => {
    expect(msg).toContain("spec.md");
    expect(msg).toContain("Scenarios as primary test source");
  });

  it("spec.md step appears before design.md step", () => {
    const specIdx = msg.indexOf("spec.md");
    const designIdx = msg.indexOf("design.md");
    expect(specIdx).toBeLessThan(designIdx);
  });

  it("spec.md step appears before tasks.md step", () => {
    const specIdx = msg.indexOf("spec.md");
    const tasksIdx = msg.indexOf("tasks.md");
    expect(specIdx).toBeLessThan(tasksIdx);
  });

  it("step 5 does not contain unconditional 'in GIVEN/WHEN/THEN format'", () => {
    // After the change, step 5 must not instruct to generate in GIVEN/WHEN/THEN format unconditionally
    // It should instead express the mixed format rule
    expect(msg).not.toContain("in GIVEN/WHEN/THEN format");
  });
});

// ---------------------------------------------------------------------------
// TC-006 (test-dir-detection): TEST_CASE_GEN_SYSTEM_PROMPT に tests/ 固定 grep 表現がない
// Source: test-cases.md TC-006 — test-case-gen プロンプトに tests/ 固定 grep の記述がない
// ---------------------------------------------------------------------------
describe("TC-006 (test-dir-detection): TEST_CASE_GEN_SYSTEM_PROMPT — tests/ 固定 grep 表現が含まれない", () => {
  it("verification note に tests/ 固定パスの grep 表現が含まれない", () => {
    // Old text: "verification step (which greps `tests/` for each must TC ID)"
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).not.toContain("greps `tests/`");
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).not.toContain("which greps `tests/`");
  });

  it("verification note がプロジェクトの test ファイル (*.test.ts / *.spec.ts) を参照している", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("*.test.ts");
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("*.spec.ts");
  });
});

// ---------------------------------------------------------------------------
// TC-RIA-01: 繰り返し実行・冪等性の導出軸が prompt に含まれる
// Source: spec.md > Requirement: test-case-gen prompt が繰り返し実行・冪等性の導出軸を全 request で要求する
//         > Scenario: prompt に導出軸の指示が含まれる
// ---------------------------------------------------------------------------
describe("TC-RIA-01: TEST_CASE_GEN_SYSTEM_PROMPT — 繰り返し実行・冪等性の導出軸", () => {
  it("繰り返し実行・冪等性（冪等 / idempotency）の観点が含まれる", () => {
    const hasIdempotency =
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("冪等") ||
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("idempotency") ||
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("Idempotency");
    expect(hasIdempotency).toBe(true);
  });

  it("2 回目以降の呼び出しを検証する must TC の導出指示が含まれる", () => {
    const hasSecondInvocation =
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("2nd") ||
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("2 回目");
    expect(hasSecondInvocation).toBe(true);
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("must");
  });

  it("該当なし明示の指示が含まれる（無言の省略を禁止）", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("該当なし");
    const hasNoSilentOmit =
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("silently omit") ||
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("無言");
    expect(hasNoSilentOmit).toBe(true);
  });

  it("適用トリガ（server / handler / connection / initialization / resource management）が明示されている", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("server");
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("handler");
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("initialization");
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("resource");
  });

  it("「該当なし」注記は TC-{NNN} 形式・Summary・Result YAML に影響しない旨が含まれる", () => {
    const hasMachineParseNote =
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("machine-parse") ||
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("TC-{NNN}") ||
      TEST_CASE_GEN_SYSTEM_PROMPT.includes("free-text");
    expect(hasMachineParseNote).toBe(true);
  });

  it("Repeat Invocation & Idempotency Axis セクションが Testable Behaviors Extraction の後にある", () => {
    const extractionIdx = TEST_CASE_GEN_SYSTEM_PROMPT.indexOf("Testable Behaviors Extraction");
    const axisIdx = TEST_CASE_GEN_SYSTEM_PROMPT.indexOf("Repeat Invocation & Idempotency Axis");
    const summaryIdx = TEST_CASE_GEN_SYSTEM_PROMPT.indexOf("Summary Section (Required)");
    expect(axisIdx).toBeGreaterThan(extractionIdx);
    expect(summaryIdx).toBeGreaterThan(axisIdx);
  });
});

// ---------------------------------------------------------------------------
// TC-006: TEST_CASE_GEN_BASE Test Case Format has GWT-omit instruction for Scenario-derived TCs
// Source: tasks.md > T-02: test-case-gen system prompt を GWT 省略指示に更新
// ---------------------------------------------------------------------------
describe("TC-006: TEST_CASE_GEN_SYSTEM_PROMPT — Scenario-derived TC GWT omit instruction", () => {
  it("Test Case Format section instructs Scenario-derived TCs to omit GWT", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("Scenario 由来 TC");
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("GWT 本体は記述しない");
  });

  it("Test Case Format section instructs non-Scenario-derived TCs to retain GWT", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("非 Scenario 由来 TC");
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("GWT は必須");
  });

  it("mixed format label is present in the system prompt", () => {
    expect(TEST_CASE_GEN_SYSTEM_PROMPT).toContain("mixed format");
  });
});
