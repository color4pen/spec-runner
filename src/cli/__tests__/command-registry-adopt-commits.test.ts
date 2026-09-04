/**
 * Tests for --adopt-commits flag in `job resume` handler.
 *
 * TC-014: --adopt-commits CLI flag is parsed and forwarded to runResumeCoreCore
 *
 * Source: tasks.md T-07
 *
 * Tests that:
 *   - `job resume <slug> --adopt-commits` passes adoptCommits: true to runResumeCoreCore
 *   - `job resume <slug>` without the flag passes falsey adoptCommits to runResumeCoreCore
 *   - Combined flags --adopt-commits --apply-canon --force all reach runResumeCoreCore correctly
 *     (no regression to existing flag wiring)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// T-20: Mock resume.js with only the primitive runResumeCoreCore.
// The real handleJobResume is in job-resume-handler.ts and imported by command-registry.ts.
// Mocking runResumeCoreCore lets us assert on argument forwarding from the real handler.
vi.mock("../resume.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../resume.js")>();
  return {
    ...actual,
    runResumeCore: vi.fn().mockResolvedValue(0),
  };
});

// Mock resume-from-issue.js so the real handler's from-issue path doesn't fire
vi.mock("../resume-from-issue.js", () => ({
  runResumeFromIssue: vi.fn().mockResolvedValue(0),
}));

// Mock logger to prevent stderr output
vi.mock("../../logger/stdout.js", () => ({
  stderrWrite: vi.fn(),
  logError: vi.fn(),
  stdoutWrite: vi.fn(),
  resolveLogLevel: vi.fn().mockReturnValue("normal"),
  setLogLevel: vi.fn(),
}));

vi.mock("../../core/command/detach.js", () => ({
  DETACH_MARKER_ENV: "SPECRUNNER_DETACHED",
  isDetachedChild: vi.fn().mockReturnValue(false),
  stripDetachFlag: vi.fn((args: string[]) => args.filter((a) => a !== "--detach")),
  detachSelf: vi.fn().mockResolvedValue(0),
}));

import { COMMANDS } from "../command-registry.js";
import type { ParsedArgs } from "../flag-parser.js";
import { runResumeCore } from "../resume.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getResumeHandler(): (parsed: ParsedArgs) => Promise<number> {
  return COMMANDS["job"]!.children!["resume"]!.handler!;
}

function makeParsedArgs(overrides: Partial<ParsedArgs> = {}): ParsedArgs {
  return {
    flags: {},
    positional: "my-slug",
    positionals: ["my-slug"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-014: --adopt-commits flag is parsed and forwarded to runResumeCore
// Source: tasks.md T-07
// ---------------------------------------------------------------------------

describe("TC-014: --adopt-commits CLI flag is parsed and forwarded to runResumeCore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runResumeCore).mockResolvedValue(0);
  });

  it("TC-014: job resume <slug> --adopt-commits parses without error", async () => {
    const handler = getResumeHandler();

    // Should not throw during handler execution; handler returns exit code (number)
    await expect(
      handler(makeParsedArgs({ flags: { "adopt-commits": true } }))
    ).resolves.toBeTypeOf("number");
  });

  it("TC-014: adoptCommits: true is passed to runResumeCore when --adopt-commits is specified", async () => {
    const handler = getResumeHandler();
    await handler(makeParsedArgs({ flags: { "adopt-commits": true } }));

    expect(runResumeCore).toHaveBeenCalledOnce();
    const [slug, options] = vi.mocked(runResumeCore).mock.calls[0]!;
    expect(slug).toBe("my-slug");
    expect((options as Record<string, unknown>)["adoptCommits"]).toBe(true);
  });

  it("TC-014: adoptCommits is falsey when --adopt-commits is NOT specified", async () => {
    const handler = getResumeHandler();
    await handler(makeParsedArgs({ flags: {} }));

    expect(runResumeCore).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(runResumeCore).mock.calls[0]!;
    // adoptCommits must be false or undefined when flag is not given
    expect(!!(options as Record<string, unknown>)["adoptCommits"]).toBe(false);
  });

  it("TC-014 (no-regression): --adopt-commits and --apply-canon and --force all reach runResumeCore correctly", async () => {
    const handler = getResumeHandler();
    await handler(
      makeParsedArgs({
        flags: {
          "adopt-commits": true,
          "apply-canon": true,
          force: true,
        },
      })
    );

    expect(runResumeCore).toHaveBeenCalledOnce();
    const [slug, options] = vi.mocked(runResumeCore).mock.calls[0]!;
    const opts = options as Record<string, unknown>;
    expect(slug).toBe("my-slug");
    expect(opts["adoptCommits"]).toBe(true);
    expect(opts["applyCanon"]).toBe(true);
    expect(opts["force"]).toBe(true);
  });

  it("TC-014 (no-regression): --adopt-commits does not override applyCanon when only --adopt-commits is given", async () => {
    const handler = getResumeHandler();
    await handler(makeParsedArgs({ flags: { "adopt-commits": true } }));

    const [, options] = vi.mocked(runResumeCore).mock.calls[0]!;
    const opts = options as Record<string, unknown>;
    // applyCanon must be false/absent when only --adopt-commits is given
    expect(!!(opts["applyCanon"])).toBe(false);
    expect(opts["adoptCommits"]).toBe(true);
  });

  it("TC-014 (no-regression): existing flags still work alongside --adopt-commits", async () => {
    const handler = getResumeHandler();
    await handler(
      makeParsedArgs({
        flags: {
          "adopt-commits": true,
          "no-worktree": true,
          json: true,
          force: true,
        },
      })
    );

    expect(runResumeCore).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(runResumeCore).mock.calls[0]!;
    const opts = options as Record<string, unknown>;
    expect(opts["adoptCommits"]).toBe(true);
    expect(opts["noWorktree"]).toBe(true);
    expect(opts["json"]).toBe(true);
    expect(opts["force"]).toBe(true);
  });
});
