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
 */
import { describe, it, expect } from "vitest";
import { STEP_NAMES, AGENT_STEP_NAMES } from "../../../../src/kernel/step-names.js";
import { conformanceResultPath } from "../../../../src/util/paths.js";
import { CONFORMANCE_SYSTEM_PROMPT } from "../../../../src/prompts/conformance-system.js";
import { ConformanceStep } from "../../../../src/core/step/conformance.js";
import { CONFORMANCE_REPORT_TOOL, JUDGE_REPORT_TOOL, CODE_REVIEW_REPORT_TOOL } from "../../../../src/core/step/report-tool.js";
import { CODE_REVIEW_SYSTEM_PROMPT } from "../../../../src/prompts/code-review-system.js";
import { toJSONSchema, object } from "zod/v4-mini";

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
