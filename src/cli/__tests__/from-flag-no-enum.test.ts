/**
 * TC-001, TC-002, TC-003, TC-004, TC-013, TC-014, TC-015, TC-037
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
// TC-004: reopen --from is rejected by CLI parser (moved to resume)
// After split-reopen-from-resume: --from is no longer a registered flag for job reopen.
// ---------------------------------------------------------------------------

describe("TC-004: --from is rejected by CLI parser for reopen (flag removed)", () => {
  it("throws FlagParseError when --from is passed to job reopen (flag not registered)", () => {
    // --from has been removed from reopen flags (D3: step selection moved to resume).
    // The flag parser must reject it as unknown.
    expect(() =>
      parseFlags(["--from", "regression-gate"], reopenFlags),
    ).toThrow();
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

  it("TC-013e: usage text does not advertise bite-evidence as a resume target", () => {
    expect(JOB_RESUME_USAGE).not.toContain("bite-evidence");
  });
});

// ---------------------------------------------------------------------------
// TC-014: reopen usage text reflects new lifecycle-only contract
// After split-reopen-from-resume: reopen no longer accepts --from, so the
// custom reviewers / step enumeration note was removed from REOPEN_USAGE.
// ---------------------------------------------------------------------------

describe("TC-014: reopen --help reflects new lifecycle-only contract (no --from step section)", () => {
  it("TC-014: reopen usage text does not list --from as a reopen option", () => {
    // The Options block of REOPEN_USAGE must not declare --from
    const optionsSection = REOPEN_USAGE.slice(REOPEN_USAGE.indexOf("Options:"));
    expect(optionsSection).not.toMatch(/^\s+--from\s/m);
  });
});
