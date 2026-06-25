/**
 * Tests for toOpenAIStrictSchema
 * (codex adapter OpenAI strict mode compatibility)
 *
 * Note: stripNullDeep was removed. Null normalization is now handled by the
 * kernel parser (parseFindings / parseObservations) directly.
 */
import { describe, it, expect } from "vitest";
import { object, toJSONSchema } from "zod/v4-mini";
import { toOpenAIStrictSchema } from "../../../src/adapter/codex/strict-schema.js";
import {
  JUDGE_REPORT_TOOL,
  PRODUCER_REPORT_TOOL,
  CODE_REVIEW_REPORT_TOOL,
  REQUEST_REVIEW_REPORT_TOOL,
  toCustomToolSpec,
} from "../../../src/core/step/report-tool.js";
import {
  parseJudgeReportInput,
} from "../../../src/core/port/report-result.js";

// ---------------------------------------------------------------------------
// T-05: toOpenAIStrictSchema — JUDGE_REPORT_TOOL / PRODUCER_REPORT_TOOL
// ---------------------------------------------------------------------------

describe("toOpenAIStrictSchema — JUDGE_REPORT_TOOL", () => {
  const baseSchema = toJSONSchema(object(JUDGE_REPORT_TOOL.zodSchema)) as Record<string, unknown>;
  const strict = toOpenAIStrictSchema(baseSchema) as Record<string, unknown>;

  it("top-level required contains all properties (ok, reason, approved, findings)", () => {
    const required = strict["required"] as string[];
    expect(required).toContain("ok");
    expect(required).toContain("reason");
    expect(required).toContain("approved");
    expect(required).toContain("findings");
  });

  it("required props that were originally required (ok) are not nullable", () => {
    const props = strict["properties"] as Record<string, Record<string, unknown>>;
    const okProp = props["ok"]!;
    // ok is a boolean — type should remain "boolean", not ["boolean","null"]
    expect(okProp["type"]).toBe("boolean");
  });

  it("reason (optional string) → type includes null", () => {
    const props = strict["properties"] as Record<string, Record<string, unknown>>;
    const reasonProp = props["reason"]!;
    expect(Array.isArray(reasonProp["type"])).toBe(true);
    expect((reasonProp["type"] as string[]).includes("null")).toBe(true);
    expect((reasonProp["type"] as string[]).includes("string")).toBe(true);
  });

  it("approved (optional boolean) → type includes null", () => {
    const props = strict["properties"] as Record<string, Record<string, unknown>>;
    const approvedProp = props["approved"]!;
    expect(Array.isArray(approvedProp["type"])).toBe(true);
    expect((approvedProp["type"] as string[]).includes("null")).toBe(true);
    expect((approvedProp["type"] as string[]).includes("boolean")).toBe(true);
  });

  it("findings (optional array) → type includes null", () => {
    const props = strict["properties"] as Record<string, Record<string, unknown>>;
    const findingsProp = props["findings"]!;
    expect(Array.isArray(findingsProp["type"])).toBe(true);
    expect((findingsProp["type"] as string[]).includes("null")).toBe(true);
    expect((findingsProp["type"] as string[]).includes("array")).toBe(true);
  });

  it("findings items: required contains all properties (severity, resolution, file, title, rationale, line)", () => {
    const props = strict["properties"] as Record<string, Record<string, unknown>>;
    const findingsProp = props["findings"]!;
    const items = findingsProp["items"] as Record<string, unknown>;
    const itemRequired = items["required"] as string[];
    expect(itemRequired).toContain("severity");
    expect(itemRequired).toContain("resolution");
    expect(itemRequired).toContain("file");
    expect(itemRequired).toContain("title");
    expect(itemRequired).toContain("rationale");
    expect(itemRequired).toContain("line");
  });

  it("findings items: line (optional number) → type includes null", () => {
    const props = strict["properties"] as Record<string, Record<string, unknown>>;
    const findingsProp = props["findings"]!;
    const items = findingsProp["items"] as Record<string, unknown>;
    const itemProps = items["properties"] as Record<string, Record<string, unknown>>;
    const lineProp = itemProps["line"]!;
    expect(Array.isArray(lineProp["type"])).toBe(true);
    expect((lineProp["type"] as string[]).includes("null")).toBe(true);
    expect((lineProp["type"] as string[]).includes("number")).toBe(true);
  });

  it("findings items: severity/resolution/file/title/rationale are NOT nullable", () => {
    const props = strict["properties"] as Record<string, Record<string, unknown>>;
    const findingsProp = props["findings"]!;
    const items = findingsProp["items"] as Record<string, unknown>;
    const itemProps = items["properties"] as Record<string, Record<string, unknown>>;
    for (const key of ["file", "title", "rationale"] as const) {
      const prop = itemProps[key]!;
      // string type, should not be an array
      expect(typeof prop["type"]).toBe("string");
      expect(prop["type"]).not.toContain("null");
    }
    // severity and resolution are anyOf (union) — should NOT have null branch added
    for (const key of ["severity", "resolution"] as const) {
      const prop = itemProps[key]!;
      if (Array.isArray(prop["anyOf"])) {
        const anyOf = prop["anyOf"] as Array<Record<string, unknown>>;
        expect(anyOf.some((b) => b["type"] === "null")).toBe(false);
      } else {
        // scalar type — should not be nullable
        if (Array.isArray(prop["type"])) {
          expect((prop["type"] as string[]).includes("null")).toBe(false);
        } else {
          expect(prop["type"]).not.toBe("null");
        }
      }
    }
  });

  it("additionalProperties: false is preserved at top-level", () => {
    expect(strict["additionalProperties"]).toBe(false);
  });

  it("input schema is not mutated", () => {
    const required = baseSchema["required"] as string[] | undefined;
    // Original should still only have ["ok"] (or nothing if not originally present)
    if (required !== undefined) {
      expect(required).not.toContain("reason");
      expect(required).not.toContain("approved");
      expect(required).not.toContain("findings");
    }
    // Properties should not be mutated
    const baseProps = baseSchema["properties"] as Record<string, Record<string, unknown>>;
    const baseReason = baseProps["reason"]!;
    // Original reason should have string type, not array
    expect(typeof baseReason["type"]).toBe("string");
  });
});

describe("toOpenAIStrictSchema — PRODUCER_REPORT_TOOL (union optional status)", () => {
  const baseSchema = toJSONSchema(object(PRODUCER_REPORT_TOOL.zodSchema)) as Record<string, unknown>;
  const strict = toOpenAIStrictSchema(baseSchema) as Record<string, unknown>;

  it("status is included in required", () => {
    const required = strict["required"] as string[];
    expect(required).toContain("status");
  });

  it("status (optional anyOf union) → anyOf has null branch", () => {
    const props = strict["properties"] as Record<string, Record<string, unknown>>;
    const statusProp = props["status"]!;
    expect(Array.isArray(statusProp["anyOf"])).toBe(true);
    const anyOf = statusProp["anyOf"] as Array<Record<string, unknown>>;
    expect(anyOf.some((b) => b["type"] === "null")).toBe(true);
  });

  it("observations is NOT in required (producer tools have no observations channel)", () => {
    const required = strict["required"] as string[];
    expect(required).not.toContain("observations");
  });

  it("observations property is NOT present in schema properties", () => {
    const props = strict["properties"] as Record<string, unknown>;
    expect(props).not.toHaveProperty("observations");
  });
});

// ---------------------------------------------------------------------------
// T-06: parseJudgeReportInput: line: null in findings is valid (kernel parser)
// ---------------------------------------------------------------------------

describe("parseJudgeReportInput: line: null in findings is valid", () => {
  it("line: null in findings → same outcome as omitting line", () => {
    const withNullLine = {
      ok: true,
      findings: [
        { severity: "high", resolution: "fixable", file: "a.ts", title: "t", rationale: "r", line: null },
      ],
    };
    const withoutLine = {
      ok: true,
      findings: [
        { severity: "high", resolution: "fixable", file: "a.ts", title: "t", rationale: "r" },
      ],
    };

    const resultWithNull = parseJudgeReportInput(withNullLine);
    const resultWithoutLine = parseJudgeReportInput(withoutLine);

    // Both should parse successfully
    expect(resultWithNull.ok).toBe(true);
    expect(resultWithoutLine.ok).toBe(true);

    if (resultWithNull.ok && resultWithoutLine.ok) {
      expect(resultWithNull.value).toEqual(resultWithoutLine.value);
    }
  });

  it("line: null → finding does not have line property", () => {
    const input = {
      ok: true,
      findings: [
        { severity: "high", resolution: "fixable", file: "a.ts", title: "t", rationale: "r", line: null },
      ],
    };
    const result = parseJudgeReportInput(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.findings![0]).not.toHaveProperty("line");
    }
  });
});

// ---------------------------------------------------------------------------
// T-07: toCustomToolSpec is unchanged (no strict conversion)
// ---------------------------------------------------------------------------

describe("toCustomToolSpec (Claude side) is unaffected by codex conversion", () => {
  it("JUDGE_REPORT_TOOL input_schema.required is [\"ok\"] only", () => {
    const spec = toCustomToolSpec(JUDGE_REPORT_TOOL);
    const schema = spec.input_schema as Record<string, unknown>;
    expect(schema["required"]).toEqual(["ok"]);
  });

  it("optional fields (reason, approved, findings) are not nullable in toCustomToolSpec output", () => {
    const spec = toCustomToolSpec(JUDGE_REPORT_TOOL);
    const props = (spec.input_schema as Record<string, unknown>)["properties"] as Record<string, Record<string, unknown>>;

    // reason should be a plain string type, not an array with "null"
    expect(typeof props["reason"]!["type"]).toBe("string");
    expect(props["reason"]!["type"]).toBe("string");

    // approved should be a plain boolean type
    expect(typeof props["approved"]!["type"]).toBe("string");
    expect(props["approved"]!["type"]).toBe("boolean");

    // findings should be a plain array type
    expect(typeof props["findings"]!["type"]).toBe("string");
    expect(props["findings"]!["type"]).toBe("array");
  });
});

// ---------------------------------------------------------------------------
// T-08: observations in strict schema for judge-family tools
// ---------------------------------------------------------------------------

describe("toOpenAIStrictSchema — JUDGE_REPORT_TOOL observations (T-08)", () => {
  const baseSchema = toJSONSchema(object(JUDGE_REPORT_TOOL.zodSchema)) as Record<string, unknown>;
  const strict = toOpenAIStrictSchema(baseSchema) as Record<string, unknown>;

  it("top-level required contains 'observations'", () => {
    const required = strict["required"] as string[];
    expect(required).toContain("observations");
  });

  it("observations (optional array) → type includes null", () => {
    const props = strict["properties"] as Record<string, Record<string, unknown>>;
    const obsProp = props["observations"]!;
    expect(Array.isArray(obsProp["type"])).toBe(true);
    expect((obsProp["type"] as string[]).includes("null")).toBe(true);
    expect((obsProp["type"] as string[]).includes("array")).toBe(true);
  });

  it("observation items: required contains severity/file/title/rationale/line", () => {
    const props = strict["properties"] as Record<string, Record<string, unknown>>;
    const obsProp = props["observations"]!;
    const items = obsProp["items"] as Record<string, unknown>;
    const itemRequired = items["required"] as string[];
    expect(itemRequired).toContain("severity");
    expect(itemRequired).toContain("file");
    expect(itemRequired).toContain("title");
    expect(itemRequired).toContain("rationale");
    expect(itemRequired).toContain("line");
  });

  it("observation items: 'resolution' is NOT present in items properties", () => {
    const props = strict["properties"] as Record<string, Record<string, unknown>>;
    const obsProp = props["observations"]!;
    const items = obsProp["items"] as Record<string, unknown>;
    const itemProps = items["properties"] as Record<string, unknown>;
    expect(itemProps).not.toHaveProperty("resolution");
  });

  it("observation items: line (optional number) → type includes null", () => {
    const props = strict["properties"] as Record<string, Record<string, unknown>>;
    const obsProp = props["observations"]!;
    const items = obsProp["items"] as Record<string, unknown>;
    const itemProps = items["properties"] as Record<string, Record<string, unknown>>;
    const lineProp = itemProps["line"]!;
    expect(Array.isArray(lineProp["type"])).toBe(true);
    expect((lineProp["type"] as string[]).includes("null")).toBe(true);
    expect((lineProp["type"] as string[]).includes("number")).toBe(true);
  });

  it("observation items: severity/file/title/rationale are NOT nullable", () => {
    const props = strict["properties"] as Record<string, Record<string, unknown>>;
    const obsProp = props["observations"]!;
    const items = obsProp["items"] as Record<string, unknown>;
    const itemProps = items["properties"] as Record<string, Record<string, unknown>>;
    for (const key of ["file", "title", "rationale"] as const) {
      const prop = itemProps[key]!;
      expect(typeof prop["type"]).toBe("string");
      expect(prop["type"]).not.toContain("null");
    }
    // severity is anyOf (union) — should NOT have null branch
    const severityProp = itemProps["severity"]!;
    if (Array.isArray(severityProp["anyOf"])) {
      const anyOf = severityProp["anyOf"] as Array<Record<string, unknown>>;
      expect(anyOf.some((b) => b["type"] === "null")).toBe(false);
    }
  });
});

describe("toOpenAIStrictSchema — CODE_REVIEW_REPORT_TOOL has observations (T-08)", () => {
  const baseSchema = toJSONSchema(object(CODE_REVIEW_REPORT_TOOL.zodSchema)) as Record<string, unknown>;
  const strict = toOpenAIStrictSchema(baseSchema) as Record<string, unknown>;

  it("top-level required contains 'observations'", () => {
    const required = strict["required"] as string[];
    expect(required).toContain("observations");
  });

  it("observation items do NOT contain 'resolution'", () => {
    const props = strict["properties"] as Record<string, Record<string, unknown>>;
    const obsProp = props["observations"]!;
    const items = obsProp["items"] as Record<string, unknown>;
    const itemProps = items["properties"] as Record<string, unknown>;
    expect(itemProps).not.toHaveProperty("resolution");
  });
});

describe("toOpenAIStrictSchema — REQUEST_REVIEW_REPORT_TOOL has observations (T-08)", () => {
  const baseSchema = toJSONSchema(object(REQUEST_REVIEW_REPORT_TOOL.zodSchema)) as Record<string, unknown>;
  const strict = toOpenAIStrictSchema(baseSchema) as Record<string, unknown>;

  it("top-level required contains 'observations'", () => {
    const required = strict["required"] as string[];
    expect(required).toContain("observations");
  });

  it("observation items do NOT contain 'resolution'", () => {
    const props = strict["properties"] as Record<string, Record<string, unknown>>;
    const obsProp = props["observations"]!;
    const items = obsProp["items"] as Record<string, unknown>;
    const itemProps = items["properties"] as Record<string, unknown>;
    expect(itemProps).not.toHaveProperty("resolution");
  });
});

describe("parseJudgeReportInput — observations line:null normalization", () => {
  it("line:null in observation → observation retained without line field", () => {
    const input = {
      ok: true,
      findings: [],
      observations: [
        { severity: "low", file: "a.ts", title: "Note", rationale: "r", line: null },
      ],
    };
    const result = parseJudgeReportInput(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.observations).toBeDefined();
      expect(result.value.observations![0]).not.toHaveProperty("line");
    }
  });
});
