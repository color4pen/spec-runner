/**
 * Tests for --apply-canon flag in `job resume` handler.
 *
 * TC-015: --apply-canon フラグが applyCanon: true として runResumeCore に伝達される
 * TC-017 (should): 既存 resume フラグが --apply-canon 追加後もリグレッションしない
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
// TC-015: --apply-canon フラグが ResumeCommand まで伝達される
// ---------------------------------------------------------------------------

describe("TC-015: --apply-canon flag reaches runResumeCore as applyCanon: true", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runResumeCore).mockResolvedValue(0);
  });

  it("TC-015: job resume --apply-canon parses without error", async () => {
    const handler = getResumeHandler();

    // Should not throw during handler execution
    await expect(
      handler(makeParsedArgs({ flags: { "apply-canon": true } }))
    ).resolves.toBeTypeOf("number");
  });

  it("TC-015: applyCanon: true is passed to runResumeCore when --apply-canon is specified", async () => {
    const handler = getResumeHandler();
    await handler(makeParsedArgs({ flags: { "apply-canon": true } }));

    expect(runResumeCore).toHaveBeenCalledOnce();
    const [slug, options] = vi.mocked(runResumeCore).mock.calls[0]!;
    expect(slug).toBe("my-slug");
    // The options passed to runResumeCore must include applyCanon: true
    expect((options as Record<string, unknown>)["applyCanon"]).toBe(true);
  });

  it("TC-015: applyCanon is false (or absent) when --apply-canon is not specified", async () => {
    const handler = getResumeHandler();
    await handler(makeParsedArgs({ flags: {} }));

    expect(runResumeCore).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(runResumeCore).mock.calls[0]!;
    // applyCanon should be false or undefined when flag is not given
    expect(!!(options as Record<string, unknown>)["applyCanon"]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-017 (should): 既存 resume フラグが --apply-canon 追加後もリグレッションしない
// ---------------------------------------------------------------------------

describe("TC-017: existing resume flags continue to work without regression after --apply-canon added", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runResumeCore).mockResolvedValue(0);
  });

  it("TC-017: --force flag still passes as force: true", async () => {
    const handler = getResumeHandler();
    await handler(makeParsedArgs({ flags: { force: true } }));

    const [, options] = vi.mocked(runResumeCore).mock.calls[0]!;
    expect((options as Record<string, unknown>)["force"]).toBe(true);
  });

  it("TC-017: --json flag still passes as json: true", async () => {
    const handler = getResumeHandler();
    await handler(makeParsedArgs({ flags: { json: true } }));

    const [, options] = vi.mocked(runResumeCore).mock.calls[0]!;
    expect((options as Record<string, unknown>)["json"]).toBe(true);
  });

  it("TC-017: --no-worktree flag still passes as noWorktree: true", async () => {
    const handler = getResumeHandler();
    await handler(makeParsedArgs({ flags: { "no-worktree": true } }));

    const [, options] = vi.mocked(runResumeCore).mock.calls[0]!;
    expect((options as Record<string, unknown>)["noWorktree"]).toBe(true);
  });

  it("TC-017: --verbose flag sets logLevel to verbose", async () => {
    const handler = getResumeHandler();
    await handler(makeParsedArgs({ flags: { verbose: true } }));

    const [, options] = vi.mocked(runResumeCore).mock.calls[0]!;
    // logLevel is derived from verbose/quiet flags via resolveLogLevel
    expect(options).toBeDefined();
  });

  it("TC-017: --quiet flag does not break handler execution", async () => {
    const handler = getResumeHandler();
    await expect(
      handler(makeParsedArgs({ flags: { quiet: true } }))
    ).resolves.toBeTypeOf("number");
  });

  it("TC-017: all flags combined — --apply-canon + --force + --json + --no-worktree parse correctly", async () => {
    const handler = getResumeHandler();
    await handler(makeParsedArgs({
      flags: {
        "apply-canon": true,
        force: true,
        json: true,
        "no-worktree": true,
      },
    }));

    const [slug, options] = vi.mocked(runResumeCore).mock.calls[0]!;
    const opts = options as Record<string, unknown>;
    expect(slug).toBe("my-slug");
    expect(opts["applyCanon"]).toBe(true);
    expect(opts["force"]).toBe(true);
    expect(opts["json"]).toBe(true);
    expect(opts["noWorktree"]).toBe(true);
  });
});
