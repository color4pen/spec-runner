/**
 * TC-048: formatJson all pass → valid JSON with summary.fail=0
 * TC-049: formatJson with fail → summary.fail >= 1
 * TC-050: formatJson has no decoration chars
 * TC-051: formatJson omits undefined hint/details
 * TC-057: formatHuman groups by category
 * TC-058: formatHuman has Summary line at end
 * TC-067: formatJson results are in execution order
 * TC-077: formatHuman empty → no throw + "Summary: 0 pass, 0 warn, 0 fail"
 * TC-078: formatJson empty → { summary: {0,0,0}, results: [] }
 */
import { describe, it, expect } from "vitest";
import { formatHuman, formatJson } from "../../../src/core/doctor/formatter.js";
import type { DoctorResult } from "../../../src/core/doctor/types.js";

function makeResult(overrides: Partial<DoctorResult> = {}): DoctorResult {
  return {
    name: "test-check",
    category: "runtime",
    required: true,
    status: "pass",
    message: "ok",
    ...overrides,
  };
}

describe("formatJson", () => {
  // TC-048
  it("produces valid JSON with summary.fail=0 for all-pass results", () => {
    const results = [makeResult({ status: "pass" }), makeResult({ name: "b", status: "pass" })];
    const json = formatJson(results);
    const parsed = JSON.parse(json);
    expect(parsed.summary.pass).toBe(2);
    expect(parsed.summary.warn).toBe(0);
    expect(parsed.summary.fail).toBe(0);
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0]).toMatchObject({ name: "test-check", status: "pass" });
  });

  // TC-049
  it("sets summary.fail >= 1 when a fail result is present", () => {
    const results = [makeResult({ status: "fail", message: "boom" })];
    const parsed = JSON.parse(formatJson(results));
    expect(parsed.summary.fail).toBeGreaterThanOrEqual(1);
    expect(parsed.results[0].status).toBe("fail");
  });

  // TC-050
  it("output contains no decoration characters or ANSI codes", () => {
    const results = [makeResult({ status: "warn", hint: "fix it" })];
    const json = formatJson(results);
    expect(json).not.toContain("[✓]");
    expect(json).not.toContain("[!]");
    expect(json).not.toContain("[✗]");
    // Should be parseable
    expect(() => JSON.parse(json)).not.toThrow();
  });

  // TC-051
  it("omits hint and details keys when they are undefined", () => {
    const result = makeResult({ hint: undefined, details: undefined });
    const parsed = JSON.parse(formatJson([result]));
    expect(Object.keys(parsed.results[0])).not.toContain("hint");
    expect(Object.keys(parsed.results[0])).not.toContain("details");
  });

  it("includes hint and details when they are defined", () => {
    const result = makeResult({ hint: "do this", details: ["detail1"] });
    const parsed = JSON.parse(formatJson([result]));
    expect(parsed.results[0].hint).toBe("do this");
    expect(parsed.results[0].details).toEqual(["detail1"]);
  });

  // TC-067
  it("results array maintains execution order", () => {
    const results = [
      makeResult({ name: "a", category: "auth" }),
      makeResult({ name: "b", category: "runtime" }),
      makeResult({ name: "c", category: "config" }),
    ];
    const parsed = JSON.parse(formatJson(results));
    expect(parsed.results.map((r: DoctorResult) => r.name)).toEqual(["a", "b", "c"]);
  });

  // TC-078
  it("returns valid JSON with all-zero summary for empty results", () => {
    const parsed = JSON.parse(formatJson([]));
    expect(parsed).toEqual({ summary: { pass: 0, warn: 0, fail: 0 }, results: [] });
  });
});

describe("formatHuman", () => {
  // TC-057
  it("groups results by category", () => {
    const results = [
      makeResult({ name: "node", category: "runtime", status: "pass" }),
      makeResult({ name: "config-file", category: "config", status: "fail" }),
      makeResult({ name: "bun", category: "runtime", status: "pass" }),
    ];
    const output = formatHuman(results);
    // runtime should appear before config
    expect(output.indexOf("[RUNTIME]")).toBeLessThan(output.indexOf("[CONFIG]"));
    // Both runtime results should be in the runtime group
    const runtimeSection = output.split("[CONFIG]")[0]!;
    expect(runtimeSection).toContain("node");
    expect(runtimeSection).toContain("bun");
  });

  it("uses correct status symbols", () => {
    const results = [
      makeResult({ name: "a", status: "pass" }),
      makeResult({ name: "b", status: "warn" }),
      makeResult({ name: "c", status: "fail" }),
    ];
    const output = formatHuman(results);
    expect(output).toContain("[✓]");
    expect(output).toContain("[!]");
    expect(output).toContain("[✗]");
  });

  // TC-058
  it("ends with a Summary line", () => {
    const results = [
      makeResult({ status: "pass" }),
      makeResult({ name: "b", status: "warn" }),
      makeResult({ name: "c", status: "fail" }),
    ];
    const output = formatHuman(results);
    expect(output).toMatch(/Summary: 1 pass, 1 warn, 1 fail/);
  });

  // TC-077
  it("returns a Summary line even for empty results", () => {
    const output = formatHuman([]);
    expect(output).toContain("Summary: 0 pass, 0 warn, 0 fail");
    expect(() => formatHuman([])).not.toThrow();
  });
});
