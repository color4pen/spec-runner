/**
 * Unit tests for conformance step
 *
 * TC-009: code-review system prompt references spec.md not specs/
 * TC-010: STEP_NAMES and AGENT_STEP_NAMES include "conformance"
 * TC-011: conformanceResultPath returns zero-padded path
 * TC-012: CONFORMANCE_SYSTEM_PROMPT references all 4 judgment items
 * TC-013: ConformanceStep satisfies AgentStep with correct identity
 * TC-017: ConformanceStep maxTurns equals 15
 * TC-CONF-01: CONFORMANCE_REPORT_TOOL schema contains fixTarget
 * TC-CONF-02: JUDGE_REPORT_TOOL / CODE_REVIEW_REPORT_TOOL schema do NOT contain fixTarget
 * TC-CONF-03: CONFORMANCE_SYSTEM_PROMPT contains fixTarget and 3 routing targets
 *
 * conformance-canon-tiers (TC IDs frozen):
 * TC-001: prompt が二層宣言の anchor 文字列を含む
 * TC-002: prompt が非 finding 化と根拠引用の指示 anchor を含む
 * TC-003: prompt が全件確認の指示を保持する
 * TC-004: report tool の fixTarget enum が 3 値を保持する
 * TC-005: verdict 導出と集約の既存挙動が保たれる
 * TC-006: prompt 5節骨格と共有定数の埋め込みが維持される
 * TC-007: buildMessage に checkbox 完了性 gate 表現が存在しない
 */
import { describe, it, expect } from "vitest";
import { STEP_NAMES, AGENT_STEP_NAMES } from "../../../../src/kernel/step-names.js";
import { conformanceResultPath } from "../../../../src/util/paths.js";
import { CONFORMANCE_SYSTEM_PROMPT } from "../../../../src/prompts/conformance-system.js";
import { ConformanceStep } from "../../../../src/core/step/conformance.js";
import { CONFORMANCE_REPORT_TOOL, JUDGE_REPORT_TOOL, CODE_REVIEW_REPORT_TOOL } from "../../../../src/core/step/report-tool.js";
import { CODE_REVIEW_SYSTEM_PROMPT } from "../../../../src/prompts/code-review-system.js";
import { toJSONSchema, object } from "zod/v4-mini";
import { EVIDENCE_DISCIPLINE } from "../../../../src/prompts/fragments.js";
import { SEVERITY_DEFINITION } from "../../../../src/prompts/judge-rules.js";
import { deriveConformanceVerdict, aggregateFixTarget } from "../../../../src/core/step/judge-verdict.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { StepDeps } from "../../../../src/core/port/step-types.js";

// TC-009: code-review system prompt references spec.md not specs/
describe("TC-009: code-review system prompt references spec.md", () => {
  it("CODE_REVIEW_SYSTEM_PROMPT does not contain 'specs/'", () => {
    expect(CODE_REVIEW_SYSTEM_PROMPT).not.toContain("specs/");
  });

  it("CODE_REVIEW_SYSTEM_PROMPT contains 'spec.md'", () => {
    expect(CODE_REVIEW_SYSTEM_PROMPT).toContain("spec.md");
  });
});

// TC-010: STEP_NAMES and AGENT_STEP_NAMES include "conformance"
describe("TC-010: STEP_NAMES and AGENT_STEP_NAMES include 'conformance'", () => {
  it("STEP_NAMES.CONFORMANCE === 'conformance'", () => {
    expect(STEP_NAMES.CONFORMANCE).toBe("conformance");
  });

  it("AGENT_STEP_NAMES contains 'conformance'", () => {
    expect(AGENT_STEP_NAMES).toContain("conformance");
  });
});

// TC-011: conformanceResultPath returns zero-padded path
describe("TC-011: conformanceResultPath returns correct path", () => {
  it("conformanceResultPath('foo', 1) → 'specrunner/changes/foo/conformance-result-001.md'", () => {
    expect(conformanceResultPath("foo", 1)).toBe("specrunner/changes/foo/conformance-result-001.md");
  });

  it("conformanceResultPath('my-change', 10) → 'specrunner/changes/my-change/conformance-result-010.md'", () => {
    expect(conformanceResultPath("my-change", 10)).toBe("specrunner/changes/my-change/conformance-result-010.md");
  });

  it("conformanceResultPath('x', 100) → 'specrunner/changes/x/conformance-result-100.md'", () => {
    expect(conformanceResultPath("x", 100)).toBe("specrunner/changes/x/conformance-result-100.md");
  });
});

// TC-012: CONFORMANCE_SYSTEM_PROMPT references all 4 judgment items
describe("TC-012: CONFORMANCE_SYSTEM_PROMPT references all 4 judgment items", () => {
  it("contains 'tasks.md'", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("tasks.md");
  });

  it("contains 'design.md'", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("design.md");
  });

  it("contains 'spec.md'", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("spec.md");
  });

  it("contains 'request.md'", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("request.md");
  });

  it("is a non-empty string", () => {
    expect(typeof CONFORMANCE_SYSTEM_PROMPT).toBe("string");
    expect(CONFORMANCE_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });
});

// TC-013: ConformanceStep satisfies AgentStep with correct identity
describe("TC-013: ConformanceStep satisfies AgentStep with correct identity", () => {
  it("kind === 'agent'", () => {
    expect(ConformanceStep.kind).toBe("agent");
  });

  it("name === 'conformance'", () => {
    expect(ConformanceStep.name).toBe("conformance");
  });

  it("reportTool is CONFORMANCE_REPORT_TOOL", () => {
    expect(ConformanceStep.reportTool).toBe(CONFORMANCE_REPORT_TOOL);
  });

  it("needsProjectContext is true", () => {
    expect(ConformanceStep.needsProjectContext).toBe(true);
  });
});

// TC-017: ConformanceStep maxTurns equals 15
describe("TC-017: ConformanceStep maxTurns equals 15", () => {
  it("maxTurns === 15", () => {
    expect(ConformanceStep.maxTurns).toBe(15);
  });
});

// TC-CONF-01: CONFORMANCE_REPORT_TOOL schema contains fixTarget
describe("TC-CONF-01: CONFORMANCE_REPORT_TOOL schema contains fixTarget", () => {
  it("CONFORMANCE_REPORT_TOOL zodSchema has findings with fixTarget", () => {
    const jsonSchema = toJSONSchema(object(CONFORMANCE_REPORT_TOOL.zodSchema));
    const schemaStr = JSON.stringify(jsonSchema);
    expect(schemaStr).toContain("fixTarget");
  });

  it("CONFORMANCE_REPORT_TOOL description mentions fixTarget", () => {
    expect(CONFORMANCE_REPORT_TOOL.description).toContain("fixTarget");
  });

  it("CONFORMANCE_REPORT_TOOL name is report_result", () => {
    expect(CONFORMANCE_REPORT_TOOL.name).toBe("report_result");
  });
});

// TC-CONF-02: JUDGE_REPORT_TOOL and CODE_REVIEW_REPORT_TOOL schema do NOT contain fixTarget
describe("TC-CONF-02: JUDGE_REPORT_TOOL / CODE_REVIEW_REPORT_TOOL do NOT contain fixTarget", () => {
  it("JUDGE_REPORT_TOOL schema does not contain fixTarget", () => {
    const jsonSchema = toJSONSchema(object(JUDGE_REPORT_TOOL.zodSchema));
    const schemaStr = JSON.stringify(jsonSchema);
    expect(schemaStr).not.toContain("fixTarget");
  });

  it("CODE_REVIEW_REPORT_TOOL schema does not contain fixTarget", () => {
    const jsonSchema = toJSONSchema(object(CODE_REVIEW_REPORT_TOOL.zodSchema));
    const schemaStr = JSON.stringify(jsonSchema);
    expect(schemaStr).not.toContain("fixTarget");
  });
});

// TC-CONF-03: CONFORMANCE_SYSTEM_PROMPT contains fixTarget and 3 routing targets
describe("TC-CONF-03: CONFORMANCE_SYSTEM_PROMPT fixTarget routing instructions", () => {
  it("contains 'fixTarget'", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("fixTarget");
  });

  it("contains 'spec-fixer'", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("spec-fixer");
  });

  it("contains 'implementer'", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("implementer");
  });

  it("contains 'code-fixer'", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("code-fixer");
  });
});

// ─── conformance-canon-tiers ────────────────────────────────────────────────

// TC-001: prompt が二層宣言の anchor 文字列を含む
// Source: spec.md > Requirement: conformance prompt は request/spec を規範、design/tasks を計画として二層宣言する
//         > Scenario: prompt が二層宣言の anchor 文字列を含む
describe("TC-001: prompt が二層宣言の anchor 文字列を含む", () => {
  it("contains '規範（normative）'", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("規範（normative）");
  });

  it("contains '計画・根拠（plan / rationale）'", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("計画・根拠（plan / rationale）");
  });

  it("references all 4 artifact names", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("request.md");
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("spec.md");
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("design.md");
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("tasks.md");
  });
});

// TC-002: prompt が非 finding 化と根拠引用の指示 anchor を含む
// Source: spec.md > Requirement: design/tasks との相違はそれ自体では finding にせず、finding の根拠は request/spec を引く
//         > Scenario: prompt が非 finding 化と根拠引用の指示 anchor を含む
describe("TC-002: prompt が非 finding 化と根拠引用の指示 anchor を含む", () => {
  it("contains 'それ自体では finding にしない'", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("それ自体では finding にしない");
  });

  it("contains 'finding の根拠には request.md / spec.md'", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("finding の根拠には request.md / spec.md");
  });

  it("contains 'non-blocking note'", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("non-blocking note");
  });
});

// TC-003: prompt が全件確認の指示を保持する
// Source: spec.md > Requirement: 受け入れ基準と Requirement/Scenario の全件充足確認を維持する
//         > Scenario: prompt が全件確認の指示を保持する
describe("TC-003: prompt が全件確認の指示を保持する", () => {
  it("contains '全件確認'", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("全件確認");
  });

  it("references '受け入れ基準'", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("受け入れ基準");
  });

  it("references 'Requirement'", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("Requirement");
  });

  it("references 'Scenario'", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("Scenario");
  });
});

// TC-004: report tool の fixTarget enum が 3 値を保持する
// Source: spec.md > Requirement: fixTarget enum と verdict 集約の機械意味論は不変である
//         > Scenario: report tool の fixTarget enum が 3 値を保持する
describe("TC-004: report tool の fixTarget enum が 3 値を保持する", () => {
  const jsonSchema = toJSONSchema(object(CONFORMANCE_REPORT_TOOL.zodSchema));
  const schemaStr = JSON.stringify(jsonSchema);

  it("schema contains 'implementer'", () => {
    expect(schemaStr).toContain("implementer");
  });

  it("schema contains 'code-fixer'", () => {
    expect(schemaStr).toContain("code-fixer");
  });

  it("schema contains 'spec-fixer'", () => {
    expect(schemaStr).toContain("spec-fixer");
  });

  it("description contains 'fixTarget'", () => {
    expect(CONFORMANCE_REPORT_TOOL.description).toContain("fixTarget");
  });
});

// TC-005: verdict 導出と集約の既存挙動が保たれる
// Source: spec.md > Requirement: fixTarget enum と verdict 集約の機械意味論は不変である
//         > Scenario: verdict 導出と集約の既存挙動が保たれる
describe("TC-005: verdict 導出と集約の既存挙動が保たれる", () => {
  function makeF(overrides: { fixTarget?: string; resolution?: string; severity?: string } = {}) {
    return {
      severity: overrides.severity ?? "high",
      resolution: overrides.resolution ?? "fixable",
      file: "src/f.ts",
      title: "T",
      rationale: "R",
      ...(overrides.fixTarget ? { fixTarget: overrides.fixTarget } : {}),
    } as import("../../../../src/kernel/report-result.js").Finding;
  }

  it("spec-fixer > implementer > code-fixer (priority order preserved)", () => {
    // All three present — spec-fixer wins
    expect(
      aggregateFixTarget([makeF({ fixTarget: "implementer" }), makeF({ fixTarget: "spec-fixer" }), makeF({ fixTarget: "code-fixer" })]),
    ).toBe("spec-fixer");
    // implementer > code-fixer
    expect(
      aggregateFixTarget([makeF({ fixTarget: "code-fixer" }), makeF({ fixTarget: "implementer" })]),
    ).toBe("implementer");
  });

  it("no critical/high findings → approved", () => {
    expect(deriveConformanceVerdict([], true)).toBe("approved");
  });

  it("high finding with fixTarget:spec-fixer → needs-fix:spec-fixer", () => {
    expect(
      deriveConformanceVerdict([makeF({ fixTarget: "spec-fixer" })], true),
    ).toBe("needs-fix:spec-fixer");
  });

  it("decision-needed finding → escalation", () => {
    expect(
      deriveConformanceVerdict([makeF({ resolution: "decision-needed" })], true),
    ).toBe("escalation");
  });
});

// TC-006: prompt 5節骨格と共有定数の埋め込みが維持される
// Source: design.md D7 / tasks.md T-01 AC
describe("TC-006: prompt 5節骨格と共有定数の埋め込みが維持される", () => {
  const REQUIRED_HEADINGS = ["## Question", "## Contract", "## Method", "## Evidence", "## Completion"];

  it("contains all 5 section headings", () => {
    for (const heading of REQUIRED_HEADINGS) {
      expect(CONFORMANCE_SYSTEM_PROMPT).toContain(heading);
    }
  });

  it("section headings appear in order (Question→Contract→Method→Evidence→Completion)", () => {
    const indices = REQUIRED_HEADINGS.map((h) => CONFORMANCE_SYSTEM_PROMPT.indexOf(h));
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]!).toBeGreaterThan(indices[i - 1]!);
    }
  });

  it("EVIDENCE_DISCIPLINE content is embedded", () => {
    // The prompt expands ${EVIDENCE_DISCIPLINE} — verify a distinctive substring
    const snippet = EVIDENCE_DISCIPLINE.slice(0, 40).trim();
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain(snippet);
  });

  it("SEVERITY_DEFINITION content is embedded", () => {
    const snippet = SEVERITY_DEFINITION.slice(0, 40).trim();
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain(snippet);
  });

  it("does not contain verdict output instruction patterns", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).not.toContain("required for machine parsing");
    expect(CONFORMANCE_SYSTEM_PROMPT).not.toContain("The file MUST contain a verdict line");
    expect(CONFORMANCE_SYSTEM_PROMPT).not.toContain("The verdict line MUST be exactly");
  });

  it("does not contain 'architecture/' reference", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).not.toContain("architecture/");
  });
});

// TC-007: buildMessage に checkbox 完了性 gate 表現が存在しない
// Source: design.md D5 / tasks.md T-03 AC
describe("TC-007: buildMessage に checkbox 完了性 gate 表現が存在しない", () => {
  const minimalState = { steps: {} } as unknown as JobState;
  const minimalDeps = {
    slug: "test-slug",
    config: { version: 1, runtime: "managed", agents: {} } as StepDeps["config"],
    request: {
      type: "spec-change",
      title: "Test",
      slug: "test-slug",
      baseBranch: "main",
      content: "# Test request",
      adr: false,
    },
  } as unknown as StepDeps;

  it("does not contain 'verify all checkboxes are marked complete [x]'", () => {
    const msg = ConformanceStep.buildMessage(minimalState, minimalDeps);
    expect(msg).not.toContain("verify all checkboxes are marked complete [x]");
  });
});
