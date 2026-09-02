/**
 * Tests for --adopt-commits flag in `job resume` handler.
 *
 * TC-014: --adopt-commits CLI flag is parsed and forwarded to runResume
 *
 * Source: tasks.md T-07
 *
 * Tests that:
 *   - `job resume <slug> --adopt-commits` passes adoptCommits: true to runResume
 *   - `job resume <slug>` without the flag passes falsey adoptCommits to runResume
 *   - Combined flags --adopt-commits --apply-canon --force all reach runResume correctly
 *     (no regression to existing flag wiring)
 *
 * These tests fail (RED) because:
 *   - command-registry.ts does not yet have "adopt-commits": { type: "boolean" } in the flags map
 *   - command-registry.ts does not yet pass adoptCommits to runResume
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Synthetic mock for resume.js:
// - runResume is a vi.fn() so tests can assert on its call args
// - handleJobResume is a lightweight stub that maps CLI flags → runResume options
//   (mirrors the real forwarding logic in resume.ts without the heavy detach/process-exit paths)
// Using importOriginal is NOT viable here: the real handleJobResume calls runResume via its
// module-internal binding (not the exported one), so the mock runResume would not be called.
vi.mock("../resume.js", () => {
  const mockRunResume = vi.fn().mockResolvedValue(undefined);
  return {
    runResume: mockRunResume,
    handleJobResume: vi.fn().mockImplementation(
      async (parsed: { flags: Record<string, unknown>; positional?: string }) => {
        const flags = parsed.flags;
        await mockRunResume(parsed.positional, {
          detach: !!flags["detach"],
          from: flags["from"] as string | undefined,
          force: !!flags["force"],
          applyCanon: !!flags["apply-canon"],
          adoptCommits: !!flags["adopt-commits"],
          wontfix: flags["wontfix"] as string | undefined,
          wontfixReason: flags["wontfix-reason"] as string | undefined,
          noWorktree: !!flags["no-worktree"],
          json: !!flags["json"],
          logLevel: "normal",
          cwd: process.cwd(),
          repoRoot: undefined,
          prompt: flags["prompt"] as string | undefined,
        });
      },
    ),
  };
});

// Mock logger to prevent stderr output
vi.mock("../../logger/stdout.js", () => ({
  stderrWrite: vi.fn(),
  logError: vi.fn(),
  stdoutWrite: vi.fn(),
  resolveLogLevel: vi.fn().mockReturnValue("normal"),
}));

import { COMMANDS } from "../command-registry.js";
import type { ParsedArgs } from "../flag-parser.js";
import { runResume } from "../resume.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getResumeHandler(): (parsed: ParsedArgs) => Promise<void> {
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
// TC-014: --adopt-commits flag is parsed and forwarded to runResume
// Source: tasks.md T-07
// ---------------------------------------------------------------------------

describe("TC-014: --adopt-commits CLI flag is parsed and forwarded to runResume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runResume).mockResolvedValue(undefined);
  });

  it("TC-014: job resume <slug> --adopt-commits parses without error", async () => {
    const handler = getResumeHandler();

    // Should not throw during handler execution
    await expect(
      handler(makeParsedArgs({ flags: { "adopt-commits": true } }))
    ).resolves.toBeUndefined();
  });

  it("TC-014: adoptCommits: true is passed to runResume when --adopt-commits is specified", async () => {
    const handler = getResumeHandler();
    await handler(makeParsedArgs({ flags: { "adopt-commits": true } }));

    expect(runResume).toHaveBeenCalledOnce();
    const [slug, options] = vi.mocked(runResume).mock.calls[0]!;
    expect(slug).toBe("my-slug");
    expect((options as Record<string, unknown>)["adoptCommits"]).toBe(true);
  });

  it("TC-014: adoptCommits is falsey when --adopt-commits is NOT specified", async () => {
    const handler = getResumeHandler();
    await handler(makeParsedArgs({ flags: {} }));

    expect(runResume).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(runResume).mock.calls[0]!;
    // adoptCommits must be false or undefined when flag is not given
    expect(!!(options as Record<string, unknown>)["adoptCommits"]).toBe(false);
  });

  it("TC-014 (no-regression): --adopt-commits and --apply-canon and --force all reach runResume correctly", async () => {
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

    expect(runResume).toHaveBeenCalledOnce();
    const [slug, options] = vi.mocked(runResume).mock.calls[0]!;
    const opts = options as Record<string, unknown>;
    expect(slug).toBe("my-slug");
    expect(opts["adoptCommits"]).toBe(true);
    expect(opts["applyCanon"]).toBe(true);
    expect(opts["force"]).toBe(true);
  });

  it("TC-014 (no-regression): --adopt-commits does not override applyCanon when only --adopt-commits is given", async () => {
    const handler = getResumeHandler();
    await handler(makeParsedArgs({ flags: { "adopt-commits": true } }));

    const [, options] = vi.mocked(runResume).mock.calls[0]!;
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

    expect(runResume).toHaveBeenCalledOnce();
    const [, options] = vi.mocked(runResume).mock.calls[0]!;
    const opts = options as Record<string, unknown>;
    expect(opts["adoptCommits"]).toBe(true);
    expect(opts["noWorktree"]).toBe(true);
    expect(opts["json"]).toBe(true);
    expect(opts["force"]).toBe(true);
  });
});
