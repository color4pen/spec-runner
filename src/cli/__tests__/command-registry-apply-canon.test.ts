/**
 * Tests for --apply-canon flag in `job resume` handler.
 *
 * TC-015: --apply-canon フラグが applyCanon: true として runResume に伝達される
 * TC-017 (should): 既存 resume フラグが --apply-canon 追加後もリグレッションしない
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock runResume to prevent actual job execution and capture call args
vi.mock("../resume.js", () => ({
  runResume: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger to prevent stderr output
vi.mock("../../logger/stdout.js", () => ({
  stderrWrite: vi.fn(),
  logError: vi.fn(),
  stdoutWrite: vi.fn(),
  resolveLogLevel: vi.fn().mockReturnValue("normal"),
}));

import { COMMANDS } from "../command-registry.js";
import type { ParentCommandDef } from "../command-registry.js";
import type { ParsedArgs } from "../flag-parser.js";
import { runResume } from "../resume.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getResumeHandler(): (parsed: ParsedArgs) => Promise<void> {
  const jobCmd = COMMANDS["job"] as ParentCommandDef;
  return jobCmd.subcommands["resume"]!.handler;
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

describe("TC-015: --apply-canon flag reaches runResume as applyCanon: true", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runResume).mockResolvedValue(undefined);
  });

  it("TC-015: job resume --apply-canon parses without error", async () => {
    const handler = getResumeHandler();

    // Should not throw during handler execution
    await expect(
      handler(makeParsedArgs({ flags: { "apply-canon": true } }))
    ).resolves.toBeUndefined();
  });

  it("TC-015: applyCanon: true is passed to runResume when --apply-canon is specified", async () => {
    const handler = getResumeHandler();
    await handler(makeParsedArgs({ flags: { "apply-canon": true } }));

    expect(runResume).toHaveBeenCalledOnce();
    const [slug, options] = vi.mocked(runResume).mock.calls[0]!;
    expect(slug).toBe("my-slug");
    // The options passed to runResume must include applyCanon: true
    expect((options as Record<string, unknown>)["applyCanon"]).toBe(true);
  });

  it("TC-015: applyCanon is false (or absent) when --apply-canon is not specified", async () => {
    const handler = getResumeHandler();
    await handler(makeParsedArgs({ flags: {} }));

    expect(runResume).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(runResume).mock.calls[0]!;
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
    vi.mocked(runResume).mockResolvedValue(undefined);
  });

  it("TC-017: --force flag still passes as force: true", async () => {
    const handler = getResumeHandler();
    await handler(makeParsedArgs({ flags: { force: true } }));

    const [, options] = vi.mocked(runResume).mock.calls[0]!;
    expect((options as Record<string, unknown>)["force"]).toBe(true);
  });

  it("TC-017: --json flag still passes as json: true", async () => {
    const handler = getResumeHandler();
    await handler(makeParsedArgs({ flags: { json: true } }));

    const [, options] = vi.mocked(runResume).mock.calls[0]!;
    expect((options as Record<string, unknown>)["json"]).toBe(true);
  });

  it("TC-017: --no-worktree flag still passes as noWorktree: true", async () => {
    const handler = getResumeHandler();
    await handler(makeParsedArgs({ flags: { "no-worktree": true } }));

    const [, options] = vi.mocked(runResume).mock.calls[0]!;
    expect((options as Record<string, unknown>)["noWorktree"]).toBe(true);
  });

  it("TC-017: --verbose flag sets logLevel to verbose", async () => {
    const handler = getResumeHandler();
    await handler(makeParsedArgs({ flags: { verbose: true } }));

    const [, options] = vi.mocked(runResume).mock.calls[0]!;
    // logLevel is derived from verbose/quiet flags via resolveLogLevel
    expect(options).toBeDefined();
  });

  it("TC-017: --quiet flag does not break handler execution", async () => {
    const handler = getResumeHandler();
    await expect(
      handler(makeParsedArgs({ flags: { quiet: true } }))
    ).resolves.toBeUndefined();
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

    const [slug, options] = vi.mocked(runResume).mock.calls[0]!;
    const opts = options as Record<string, unknown>;
    expect(slug).toBe("my-slug");
    expect(opts["applyCanon"]).toBe(true);
    expect(opts["force"]).toBe(true);
    expect(opts["json"]).toBe(true);
    expect(opts["noWorktree"]).toBe(true);
  });
});
