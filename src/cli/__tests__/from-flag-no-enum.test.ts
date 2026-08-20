/**
 * TC-001, TC-002, TC-003, TC-004, TC-013, TC-014, TC-015
 *
 * CLI flag-parser accepts any string for --from (no static enum constraint).
 * Usage text accurately describes dynamic --from targets.
 *
 * Source: test-cases.md
 */
import { describe, it, expect, vi } from "vitest";
import { parseFlags } from "../flag-parser.js";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("../../logger/stdout.js", () => ({
  stderrWrite: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  stdoutWrite: vi.fn(),
  resolveLogLevel: vi.fn().mockReturnValue("normal"),
  setLogLevel: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { COMMANDS, JOB_RESUME_USAGE, REOPEN_USAGE } from "../command-registry.js";

// ---------------------------------------------------------------------------
// Shared flag definitions from the actual registry
// ---------------------------------------------------------------------------

const resumeFlags = COMMANDS["job"]!.children!["resume"]!.flags!;
const reopenFlags = COMMANDS["job"]!.children!["reopen"]!.flags!;

// ---------------------------------------------------------------------------
// TC-001, TC-002, TC-003: resume --from accepts arbitrary strings
// ---------------------------------------------------------------------------

describe("TC-001: --from regression-gate accepted by CLI parser for resume", () => {
  it("does not throw FlagParseError", () => {
    expect(() =>
      parseFlags(["--from", "regression-gate"], resumeFlags),
    ).not.toThrow();
  });
});

describe("TC-002: --from custom-reviewers accepted by CLI parser for resume", () => {
  it("does not throw FlagParseError", () => {
    expect(() =>
      parseFlags(["--from", "custom-reviewers"], resumeFlags),
    ).not.toThrow();
  });
});

describe("TC-003: --from <member-name> accepted by CLI parser for resume", () => {
  it("--from alice does not throw FlagParseError", () => {
    expect(() =>
      parseFlags(["--from", "alice"], resumeFlags),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-004: reopen --from accepts arbitrary strings
// ---------------------------------------------------------------------------

describe("TC-004: --from regression-gate accepted by CLI parser for reopen", () => {
  it("does not throw FlagParseError", () => {
    expect(() =>
      parseFlags(["--from", "regression-gate"], reopenFlags),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-015: legacy alias --from build-fixer passes CLI parser
// ---------------------------------------------------------------------------

describe("TC-015: legacy alias --from build-fixer passes CLI parser", () => {
  it("--from build-fixer does not throw FlagParseError (legacy alias passed to core)", () => {
    expect(() =>
      parseFlags(["--from", "build-fixer"], resumeFlags),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-013: resume usage text accurately describes --from targets
// ---------------------------------------------------------------------------

describe("TC-013: resume --help does not contain misleading composite-steps note", () => {
  it("TC-013a: usage text does not contain 'composite steps'", () => {
    expect(JOB_RESUME_USAGE).not.toContain("composite steps");
  });

  it("TC-013b: usage text does not contain 'are not valid --from targets'", () => {
    expect(JOB_RESUME_USAGE).not.toContain("are not valid --from targets");
  });

  it("TC-013c: usage text mentions custom reviewers", () => {
    expect(JOB_RESUME_USAGE).toContain("custom reviewers");
  });

  it("TC-013d: usage text mentions regression-gate", () => {
    expect(JOB_RESUME_USAGE).toContain("regression-gate");
  });

  it("TC-013e: usage text retains bite-evidence internal step note", () => {
    expect(JOB_RESUME_USAGE).toContain("bite-evidence");
  });
});

// ---------------------------------------------------------------------------
// TC-014: reopen usage text mentions dynamic step support
// ---------------------------------------------------------------------------

describe("TC-014: reopen --help mentions custom reviewers", () => {
  it("TC-014: reopen usage text mentions custom reviewers", () => {
    expect(REOPEN_USAGE).toContain("custom reviewers");
  });
});
