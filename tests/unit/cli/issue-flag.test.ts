/**
 * Tests for --issue flag parsing and issueNumber state persistence.
 *
 * TC-IF-001: --issue 42 parses as string "42" in flag-parser
 * TC-IF-002: missing --issue → flag is undefined
 * TC-IF-003: issue number validation logic — positive integers accepted
 * TC-IF-004: issue number validation logic — non-integers rejected
 * TC-IF-005: issue number validation logic — zero and negative rejected
 * TC-IF-006: issueNumber preserved in validateJobState round-trip
 * TC-IF-007: issueNumber absent — backward compat, passes validateJobState
 * TC-IF-008: issueNumber null — passes validateJobState
 * TC-IF-009: issueNumber invalid (non-positive) — validateJobState throws
 */
import { describe, it, expect } from "vitest";
import { parseFlags } from "../../../src/cli/flag-parser.js";
import { validateJobState } from "../../../src/state/schema.js";
import type { JobState } from "../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMinimalRawState(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    jobId: "test-job-id",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "new-feature", slug: "my-slug" },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "design",
    status: "running",
    branch: null,
    history: [],
    error: null,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// TC-IF-001: --issue flag parses as string
// ---------------------------------------------------------------------------

describe("TC-IF-001: --issue 42 parses as string in flag-parser", () => {
  it("job start: --issue 42 → flag value is '42'", () => {
    const flags = {
      verbose: { type: "boolean" as const },
      "no-worktree": { type: "boolean" as const },
      issue: { type: "string" as const },
    };
    const result = parseFlags(["--issue", "42"], flags);
    expect(result.flags["issue"]).toBe("42");
  });

  it("run: --issue 100 → flag value is '100'", () => {
    const flags = {
      verbose: { type: "boolean" as const },
      json: { type: "boolean" as const },
      issue: { type: "string" as const },
    };
    const result = parseFlags(["--issue", "100"], flags);
    expect(result.flags["issue"]).toBe("100");
  });
});

// ---------------------------------------------------------------------------
// TC-IF-002: missing --issue → undefined
// ---------------------------------------------------------------------------

describe("TC-IF-002: --issue absent → flag is undefined", () => {
  it("--issue not provided → flag value is falsy", () => {
    const flags = {
      verbose: { type: "boolean" as const },
      issue: { type: "string" as const },
    };
    const result = parseFlags(["--verbose"], flags);
    expect(result.flags["issue"]).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// TC-IF-003 / TC-IF-004 / TC-IF-005: validation logic (mirrors handler logic)
// ---------------------------------------------------------------------------

/**
 * Reproduces the handler validation: Number(value) → Number.isInteger && > 0.
 */
function validateIssueArg(value: string): { valid: boolean; n: number } {
  const n = Number(value);
  const valid = Number.isInteger(n) && n > 0;
  return { valid, n };
}

describe("TC-IF-003: issue number validation — positive integers accepted", () => {
  it("'42' is a valid positive integer", () => {
    expect(validateIssueArg("42").valid).toBe(true);
    expect(validateIssueArg("42").n).toBe(42);
  });

  it("'1' is a valid positive integer", () => {
    expect(validateIssueArg("1").valid).toBe(true);
  });

  it("'99999' is a valid positive integer", () => {
    expect(validateIssueArg("99999").valid).toBe(true);
  });
});

describe("TC-IF-004: issue number validation — non-integers rejected", () => {
  it("'abc' is rejected", () => {
    expect(validateIssueArg("abc").valid).toBe(false);
  });

  it("'42abc' (trailing garbage) is rejected", () => {
    expect(validateIssueArg("42abc").valid).toBe(false);
  });

  it("'3.14' (float) is rejected", () => {
    expect(validateIssueArg("3.14").valid).toBe(false);
  });

  it("'' (empty string) is rejected", () => {
    expect(validateIssueArg("").valid).toBe(false);
  });
});

describe("TC-IF-005: issue number validation — zero and negative rejected", () => {
  it("'0' is rejected", () => {
    expect(validateIssueArg("0").valid).toBe(false);
  });

  it("'-1' is rejected", () => {
    expect(validateIssueArg("-1").valid).toBe(false);
  });

  it("'-42' is rejected", () => {
    expect(validateIssueArg("-42").valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-IF-006: issueNumber round-trip in validateJobState
// ---------------------------------------------------------------------------

describe("TC-IF-006: issueNumber preserved in validateJobState", () => {
  it("issueNumber: 42 passes validation and is preserved", () => {
    const raw = makeMinimalRawState({ issueNumber: 42 });
    const state = validateJobState(raw) as JobState;
    expect(state.issueNumber).toBe(42);
  });

  it("issueNumber: 1 passes validation", () => {
    const raw = makeMinimalRawState({ issueNumber: 1 });
    const state = validateJobState(raw) as JobState;
    expect(state.issueNumber).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TC-IF-007: issueNumber absent — backward compat
// ---------------------------------------------------------------------------

describe("TC-IF-007: issueNumber absent — backward compat", () => {
  it("missing issueNumber passes validateJobState and is undefined", () => {
    const raw = makeMinimalRawState();
    const state = validateJobState(raw) as JobState;
    expect(state.issueNumber).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-IF-008: issueNumber null — passes
// ---------------------------------------------------------------------------

describe("TC-IF-008: issueNumber null — passes validateJobState", () => {
  it("issueNumber: null is valid", () => {
    const raw = makeMinimalRawState({ issueNumber: null });
    const state = validateJobState(raw) as JobState;
    expect(state.issueNumber).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-IF-009: issueNumber invalid — validateJobState throws
// ---------------------------------------------------------------------------

describe("TC-IF-009: issueNumber invalid — validateJobState throws", () => {
  it("issueNumber: 0 throws", () => {
    const raw = makeMinimalRawState({ issueNumber: 0 });
    expect(() => validateJobState(raw)).toThrow(/positive integer/i);
  });

  it("issueNumber: -1 throws", () => {
    const raw = makeMinimalRawState({ issueNumber: -1 });
    expect(() => validateJobState(raw)).toThrow(/positive integer/i);
  });

  it("issueNumber: 3.14 (float) throws", () => {
    const raw = makeMinimalRawState({ issueNumber: 3.14 });
    expect(() => validateJobState(raw)).toThrow(/positive integer/i);
  });
});
