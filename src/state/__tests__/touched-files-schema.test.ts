/**
 * Schema validation tests for JobState.touchedFiles field (TC-019 to TC-021).
 *
 * TC-019: validateJobState が touchedFiles 不在の legacy state を受理する
 * TC-020: validateJobState が非 object な touchedFiles を throw する
 * TC-021 (should): validateJobState が value に非配列を持つ touchedFiles を throw する
 */

import { describe, it, expect } from "vitest";
import { validateJobState } from "../schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 2,
    jobId: "tf-schema-test-job",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    request: { path: "/req.md", title: "T", type: "bug-fix", slug: "t" },
    repository: { owner: "o", name: "r" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "feat/t",
    history: [],
    error: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-019: touchedFiles 不在の legacy state は受理される（後方互換）
// ---------------------------------------------------------------------------

describe("TC-019: validateJobState accepts legacy state without touchedFiles (backward compat)", () => {
  it("does not throw when touchedFiles field is absent", () => {
    const raw = makeMinimalRaw(); // no touchedFiles key
    expect(() => validateJobState(raw)).not.toThrow();
  });

  it("returns a state where touchedFiles is undefined when absent", () => {
    const raw = makeMinimalRaw();
    const state = validateJobState(raw);
    const asAny = state as Record<string, unknown>;
    expect(asAny["touchedFiles"]).toBeUndefined();
  });

  it("accepts valid touchedFiles with string array values", () => {
    const raw = makeMinimalRaw({
      touchedFiles: {
        implementer: ["src/core/foo.ts", "src/adapter/bar.ts"],
        design: ["specrunner/changes/my-change/design.md"],
      },
    });

    expect(() => validateJobState(raw)).not.toThrow();

    const state = validateJobState(raw);
    const asAny = state as Record<string, unknown>;
    const tf = asAny["touchedFiles"] as Record<string, string[]>;
    expect(tf["implementer"]).toEqual(["src/core/foo.ts", "src/adapter/bar.ts"]);
  });

  it("accepts touchedFiles with empty array values", () => {
    const raw = makeMinimalRaw({
      touchedFiles: {
        implementer: [],
      },
    });

    expect(() => validateJobState(raw)).not.toThrow();
  });

  it("accepts touchedFiles as empty object", () => {
    const raw = makeMinimalRaw({ touchedFiles: {} });
    expect(() => validateJobState(raw)).not.toThrow();
  });

  it("round-trips through JSON.stringify/parse", () => {
    const raw = makeMinimalRaw({
      touchedFiles: {
        implementer: ["src/core/foo.ts"],
      },
    });

    const state = validateJobState(raw);
    const json = JSON.stringify(state);
    const reparsed = JSON.parse(json) as Record<string, unknown>;
    const reloaded = validateJobState(reparsed);

    const asAny = reloaded as Record<string, unknown>;
    const tf = asAny["touchedFiles"] as Record<string, string[]>;
    expect(tf["implementer"]).toEqual(["src/core/foo.ts"]);
  });
});

// ---------------------------------------------------------------------------
// TC-020: 非 object な touchedFiles は throw する
// ---------------------------------------------------------------------------

describe("TC-020: validateJobState throws when touchedFiles is not an object", () => {
  it("throws when touchedFiles is an array", () => {
    const raw = makeMinimalRaw({ touchedFiles: ["src/foo.ts"] });
    expect(() => validateJobState(raw)).toThrow();
  });

  it("throws when touchedFiles is a string", () => {
    const raw = makeMinimalRaw({ touchedFiles: "src/foo.ts" });
    expect(() => validateJobState(raw)).toThrow();
  });

  it("throws when touchedFiles is a number", () => {
    const raw = makeMinimalRaw({ touchedFiles: 42 });
    expect(() => validateJobState(raw)).toThrow();
  });

  it("throws when touchedFiles is boolean", () => {
    const raw = makeMinimalRaw({ touchedFiles: true });
    expect(() => validateJobState(raw)).toThrow();
  });

  it("error message references touchedFiles", () => {
    const raw = makeMinimalRaw({ touchedFiles: "not-an-object" });
    expect(() => validateJobState(raw)).toThrow(/touchedFiles/i);
  });
});

// ---------------------------------------------------------------------------
// TC-021 (should): value に非配列を持つ touchedFiles は throw する
// ---------------------------------------------------------------------------

describe("TC-021: validateJobState throws when touchedFiles value is not an array (should)", () => {
  it("throws when a value entry is an object instead of string[]", () => {
    const raw = makeMinimalRaw({
      touchedFiles: {
        implementer: { path: "src/foo.ts" }, // object, not array
      },
    });
    expect(() => validateJobState(raw)).toThrow();
  });

  it("throws when a value entry is a string instead of string[]", () => {
    const raw = makeMinimalRaw({
      touchedFiles: {
        implementer: "src/foo.ts", // string scalar, not array
      },
    });
    expect(() => validateJobState(raw)).toThrow();
  });

  it("throws when a value entry is a number instead of string[]", () => {
    const raw = makeMinimalRaw({
      touchedFiles: {
        implementer: 99,
      },
    });
    expect(() => validateJobState(raw)).toThrow();
  });
});
