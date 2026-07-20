/**
 * Tests for detailsHuman support in the doctor formatter.
 *
 * TC-012: Other doctor checks render identically after this change
 * TC-019: Formatter renders detailsHuman in human mode; full details in JSON without detailsHuman key
 */
import { describe, it, expect } from "vitest";
import { formatHuman, formatJson } from "../../../../src/core/doctor/formatter.js";
import type { DoctorResult } from "../../../../src/core/doctor/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<DoctorResult> = {}): DoctorResult {
  return {
    name: "test-check",
    category: "storage",
    required: false,
    status: "warn",
    message: "found orphans",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-019: Formatter renders detailsHuman in human mode; full details in JSON
// ---------------------------------------------------------------------------

describe("TC-019: formatter detailsHuman rendering", () => {
  it("formatHuman renders detailsHuman bullet lines when detailsHuman is present", () => {
    const n = 3;
    const allPaths = Array.from({ length: n + 2 }, (_, i) => `/sidecar/path-${i}`);
    const humanPaths = allPaths.slice(0, n);
    const remainder = `…and 2 more`;
    const detailsHuman = [...humanPaths, remainder];

    const result = makeResult({
      details: allPaths,
      detailsHuman,
    });

    const output = formatHuman([result]);

    // formatHuman should use detailsHuman
    for (const p of humanPaths) {
      expect(output).toContain(`- ${p}`);
    }
    expect(output).toContain(`- ${remainder}`);

    // The extra full paths should NOT appear (they're in details but not detailsHuman)
    for (const p of allPaths.slice(n)) {
      expect(output).not.toContain(`- ${p}`);
    }
  });

  it("formatHuman output has exactly detailsHuman.length bullet lines under the check", () => {
    const detailsHuman = ["/path/a", "/path/b", "…and 5 more"];
    const details = Array.from({ length: 7 }, (_, i) => `/path/${i}`);

    const result = makeResult({ details, detailsHuman });
    const output = formatHuman([result]);

    // Count bullet lines
    const bulletLines = output.split("\n").filter((l) => l.trim().startsWith("- "));
    expect(bulletLines).toHaveLength(detailsHuman.length);
  });

  it("formatJson emits full details array and does NOT include detailsHuman key", () => {
    const allPaths = ["/sidecar/a", "/sidecar/b", "/sidecar/c", "/sidecar/d", "/sidecar/e"];
    const detailsHuman = ["/sidecar/a", "/sidecar/b", "…and 3 more"];

    const result = makeResult({ details: allPaths, detailsHuman });
    const json = formatJson([result]);
    const parsed = JSON.parse(json);

    // Full details present
    expect(parsed.results[0].details).toEqual(allPaths);
    expect(parsed.results[0].details).toHaveLength(5);

    // detailsHuman key is NOT in the JSON output
    expect(Object.keys(parsed.results[0])).not.toContain("detailsHuman");
  });

  it("formatJson with detailsHuman present still produces valid JSON without detailsHuman", () => {
    const result = makeResult({
      details: ["/a", "/b"],
      detailsHuman: ["/a", "…and 1 more"],
    });
    const json = formatJson([result]);

    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json);
    expect(parsed.results[0].details).toEqual(["/a", "/b"]);
    expect("detailsHuman" in parsed.results[0]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-012: Other doctor checks render identically after this change
// ---------------------------------------------------------------------------

describe("TC-012: checks without detailsHuman render identically to before", () => {
  it("formatHuman with no detailsHuman renders details as before (fallback to details)", () => {
    const details = ["/path/detail-a", "/path/detail-b"];
    const result = makeResult({ details });
    // No detailsHuman field

    const output = formatHuman([result]);

    for (const d of details) {
      expect(output).toContain(`- ${d}`);
    }
  });

  it("formatHuman with undefined detailsHuman is byte-identical to a result without the field", () => {
    const details = ["/path/x", "/path/y"];
    const withUndefined = makeResult({ details, detailsHuman: undefined });
    const withoutField = makeResult({ details });

    const outputWithUndefined = formatHuman([withUndefined]);
    const outputWithoutField = formatHuman([withoutField]);

    expect(outputWithUndefined).toBe(outputWithoutField);
  });

  it("formatJson with no detailsHuman is identical to before (details emitted, no extra keys)", () => {
    const details = ["/path/a", "/path/b"];
    const result = makeResult({ details });

    const json = formatJson([result]);
    const parsed = JSON.parse(json);

    expect(parsed.results[0].details).toEqual(details);
    expect(Object.keys(parsed.results[0])).not.toContain("detailsHuman");
  });

  it("formatJson with undefined detailsHuman is byte-identical to a result without the field", () => {
    const details = ["/path/x"];
    const withUndefined = makeResult({ details, detailsHuman: undefined });
    const withoutField = makeResult({ details });

    const jsonWithUndefined = formatJson([withUndefined]);
    const jsonWithoutField = formatJson([withoutField]);

    expect(jsonWithUndefined).toBe(jsonWithoutField);
  });

  it("a non-storage check with no detailsHuman still groups and renders correctly", () => {
    const runtimeResult: DoctorResult = {
      name: "node-version",
      category: "runtime",
      required: true,
      status: "pass",
      message: "ok",
    };
    const storageResult = makeResult({ name: "orphan-sidecars" });

    const output = formatHuman([runtimeResult, storageResult]);

    expect(output).toContain("[RUNTIME]");
    expect(output).toContain("[STORAGE]");
    expect(output).toContain("node-version");
    expect(output).toContain("orphan-sidecars");
  });
});
