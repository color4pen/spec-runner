/**
 * Tests for toOpenAIStrictSchema and stripNullDeep
 * (codex adapter OpenAI strict mode compatibility)
 */
import { describe, it, expect } from "vitest";
import { object, toJSONSchema } from "zod/v4-mini";
import { toOpenAIStrictSchema, stripNullDeep } from "../../../src/adapter/codex/strict-schema.js";
import {
  JUDGE_REPORT_TOOL,
  PRODUCER_REPORT_TOOL,
  toCustomToolSpec,
} from "../../../src/core/step/report-tool.js";
import {
  parseBaseReportInput,
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
});

// ---------------------------------------------------------------------------
// T-06: stripNullDeep + parse — null equals undefined in typed outcome
// ---------------------------------------------------------------------------

describe("stripNullDeep", () => {
  it("removes null-valued keys from a flat object", () => {
    const result = stripNullDeep({ ok: true, reason: null });
    expect(result).toEqual({ ok: true });
  });

  it("does not modify non-null values", () => {
    const result = stripNullDeep({ ok: false, reason: "fail" });
    expect(result).toEqual({ ok: false, reason: "fail" });
  });

  it("removes line: null from findings array elements", () => {
    const input = {
      ok: true,
      findings: [
        { severity: "high", resolution: "fixable", file: "a.ts", title: "t", rationale: "r", line: null },
      ],
    };
    const result = stripNullDeep(input) as Record<string, unknown>;
    const findings = result["findings"] as Array<Record<string, unknown>>;
    expect(findings[0]).not.toHaveProperty("line");
  });

  it("recurses into nested array of objects", () => {
    const input = {
      items: [{ a: null, b: 1 }, { a: 2, c: null }],
    };
    const result = stripNullDeep(input) as Record<string, unknown>;
    const items = result["items"] as Array<Record<string, unknown>>;
    expect(items[0]).toEqual({ b: 1 });
    expect(items[1]).toEqual({ a: 2 });
  });

  it("does not mutate input", () => {
    const input = { ok: true, reason: null };
    const copy = { ...input };
    stripNullDeep(input);
    expect(input).toEqual(copy);
  });

  it("returns primitive as-is", () => {
    expect(stripNullDeep(42)).toBe(42);
    expect(stripNullDeep("hello")).toBe("hello");
    expect(stripNullDeep(true)).toBe(true);
    expect(stripNullDeep(null)).toBeNull();
  });
});

describe("stripNullDeep + parseBaseReportInput: null equals undefined outcome", () => {
  it("{ ok: true, reason: null } parses the same as { ok: true }", () => {
    const withNull = stripNullDeep({ ok: true, reason: null });
    const withUndefined = { ok: true };

    const resultFromNull = parseBaseReportInput(withNull);
    const resultFromUndefined = parseBaseReportInput(withUndefined);

    expect(resultFromNull.ok).toBe(true);
    expect(resultFromUndefined.ok).toBe(true);
    if (resultFromNull.ok && resultFromUndefined.ok) {
      expect(resultFromNull.value).toEqual(resultFromUndefined.value);
    }
  });
});

describe("stripNullDeep + parseJudgeReportInput: line: null in findings is valid", () => {
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

    const resultWithNull = parseJudgeReportInput(stripNullDeep(withNullLine));
    const resultWithoutLine = parseJudgeReportInput(withoutLine);

    // Both should parse successfully
    expect(resultWithNull.ok).toBe(true);
    expect(resultWithoutLine.ok).toBe(true);

    if (resultWithNull.ok && resultWithoutLine.ok) {
      expect(resultWithNull.value).toEqual(resultWithoutLine.value);
    }
  });

  it("line: null stripped → findings element does not have line property", () => {
    const input = {
      ok: true,
      findings: [
        { severity: "high", resolution: "fixable", file: "a.ts", title: "t", rationale: "r", line: null },
      ],
    };
    const normalized = stripNullDeep(input) as Record<string, unknown>;
    const findings = normalized["findings"] as Array<Record<string, unknown>>;
    expect(findings[0]).not.toHaveProperty("line");
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
