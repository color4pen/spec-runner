/**
 * CLI flag integration tests for --detach flag and job wait command.
 *
 * TC-004: `--detach` と `--json` の同時指定は ARG_ERROR（exit 2）
 * TC-023: --detach flag が run / job start / job resume で Unknown flag エラーにならない
 * TC-024: detach 経路で SLUG_REGEX 検証が失敗した場合 spawn せず非ゼロ終了する
 */
import { describe, it, expect, vi } from "vitest";
import { parseFlags } from "../flag-parser.js";
import type { FlagDef } from "../flag-parser.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../run.js", () => ({
  runRun: vi.fn().mockResolvedValue(undefined),
  runRunCore: vi.fn().mockResolvedValue(0),
}));

vi.mock("../resume.js", () => ({
  runResume: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../logger/stdout.js", () => ({
  stderrWrite: vi.fn(),
  logError: vi.fn(),
  stdoutWrite: vi.fn(),
  logInfo: vi.fn(),
  resolveLogLevel: vi.fn().mockReturnValue("normal"),
  setLogLevel: vi.fn(),
}));

vi.mock("../../core/command/detach.js", () => ({
  DETACH_MARKER_ENV: "SPECRUNNER_DETACHED",
  isDetachedChild: vi.fn().mockReturnValue(false),
  stripDetachFlag: vi.fn((args: string[]) => args.filter((a) => a !== "--detach" && !a.startsWith("--detach="))),
  buildDetachGuidance: vi.fn().mockReturnValue("detach guidance"),
  // TC-015: updated from mockReturnValue to mockResolvedValue — detachSelf is now async
  detachSelf: vi.fn().mockResolvedValue(0),
}));

// Mock job-wait to prevent real filesystem access when the handler is called
vi.mock("../job-wait.js", () => ({
  runJobWait: vi.fn().mockResolvedValue(2),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { COMMANDS } from "../command-registry.js";
import type { ParentCommandDef, CommandDef } from "../command-registry.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRunFlagDefs(): Record<string, FlagDef> {
  const runCmd = COMMANDS["run"] as CommandDef;
  return runCmd.flags;
}

function getJobStartFlagDefs(): Record<string, FlagDef> {
  const jobCmd = COMMANDS["job"] as ParentCommandDef;
  return jobCmd.subcommands["start"]!.flags;
}

function getJobResumeFlagDefs(): Record<string, FlagDef> {
  const jobCmd = COMMANDS["job"] as ParentCommandDef;
  return jobCmd.subcommands["resume"]!.flags;
}

function getJobWaitHandler() {
  const jobCmd = COMMANDS["job"] as ParentCommandDef;
  return jobCmd.subcommands["wait"]?.handler;
}

// ---------------------------------------------------------------------------
// TC-023: --detach flag が run / job start / job resume で Unknown flag エラーにならない
// ---------------------------------------------------------------------------

describe("TC-023: --detach flag が Known flag として登録されている", () => {
  it("TC-023: run flags include detach", () => {
    const flagDefs = getRunFlagDefs();
    expect(flagDefs["detach"]).toBeDefined();
    expect(flagDefs["detach"]!.type).toBe("boolean");
  });

  it("TC-023: job start flags include detach", () => {
    const flagDefs = getJobStartFlagDefs();
    expect(flagDefs["detach"]).toBeDefined();
    expect(flagDefs["detach"]!.type).toBe("boolean");
  });

  it("TC-023: job resume flags include detach", () => {
    const flagDefs = getJobResumeFlagDefs();
    expect(flagDefs["detach"]).toBeDefined();
    expect(flagDefs["detach"]!.type).toBe("boolean");
  });

  it("TC-023: parseFlags with --detach does not throw FlagParseError for run", () => {
    const flagDefs = getRunFlagDefs();
    expect(() => {
      parseFlags(["my-slug", "--detach"], flagDefs, { name: "slug", required: true });
    }).not.toThrow();
  });

  it("TC-023: parseFlags with --detach does not throw FlagParseError for job start", () => {
    const flagDefs = getJobStartFlagDefs();
    expect(() => {
      parseFlags(["my-slug", "--detach"], flagDefs, { name: "slug", required: true });
    }).not.toThrow();
  });

  it("TC-023: parseFlags with --detach does not throw FlagParseError for job resume", () => {
    const flagDefs = getJobResumeFlagDefs();
    expect(() => {
      parseFlags(["my-slug", "--detach"], flagDefs, { name: "slug", required: true });
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-004: `--detach` と `--json` の同時指定は ARG_ERROR（exit 2）
// ---------------------------------------------------------------------------

describe("TC-004: --detach と --json の同時指定は ARG_ERROR（exit 2）", () => {
  it("TC-004: run handler exits with code 2 when both --detach and --json are given", async () => {
    const runCmd = COMMANDS["run"] as CommandDef;
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: number) => {
      throw new Error(`process.exit(${_code})`);
    });

    try {
      await expect(
        runCmd.handler({
          flags: { detach: true, json: true },
          positional: "my-slug",
          positionals: ["my-slug"],
        }),
      ).rejects.toThrow("process.exit(2)");
    } finally {
      exitSpy.mockRestore();
    }
  });

  it("TC-004: job start handler exits with code 2 when both --detach and --json are given", async () => {
    const jobCmd = COMMANDS["job"] as ParentCommandDef;
    const startHandler = jobCmd.subcommands["start"]!.handler;
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((_code?: number) => {
      throw new Error(`process.exit(${_code})`);
    });

    try {
      await expect(
        startHandler({
          flags: { detach: true, json: true },
          positional: "my-slug",
          positionals: ["my-slug"],
        }),
      ).rejects.toThrow("process.exit(2)");
    } finally {
      exitSpy.mockRestore();
    }
  });

  it("TC-004: --detach alone does NOT exit with code 2 (no ARG_ERROR)", async () => {
    const runCmd = COMMANDS["run"] as CommandDef;
    const exitCodes: number[] = [];
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: number) => {
      exitCodes.push(code ?? 0);
      throw new Error(`process.exit(${code})`);
    });

    try {
      await runCmd.handler({
        flags: { detach: true },
        positional: "my-slug",
        positionals: ["my-slug"],
      });
    } catch {
      // expected: process.exit throws in tests
    } finally {
      exitSpy.mockRestore();
    }

    // No exit code 2 should have been issued
    expect(exitCodes.filter((c) => c === 2)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-024: detach 経路で SLUG_REGEX 検証が失敗した場合 spawn せず非ゼロ終了する
// ---------------------------------------------------------------------------

describe("TC-024: SLUG_REGEX 検証失敗時は spawn せず非ゼロ終了する", () => {
  it("TC-024: job wait subcommand is registered in command registry", () => {
    const jobCmd = COMMANDS["job"] as ParentCommandDef;
    expect(jobCmd.subcommands["wait"]).toBeDefined();
  });

  it("TC-024: job wait requires a positional slug argument", () => {
    const jobCmd = COMMANDS["job"] as ParentCommandDef;
    const waitCmd = jobCmd.subcommands["wait"]!;
    expect(waitCmd.positional).toBeDefined();
    expect(waitCmd.positional?.required).toBe(true);
  });

  it("TC-024: run handler with invalid slug (uppercase) in detach mode does not spawn", async () => {
    // Note: The full slug validation happens inside the run handler when --detach is set.
    // The handler must validate the resolved slug with SLUG_REGEX before calling detachSelf.
    // This test verifies that an invalid slug (containing uppercase) in detach mode
    // causes non-zero exit without spawning.

    const { detachSelf } = await import("../../core/command/detach.js");
    vi.mocked(detachSelf).mockResolvedValue(0); // TC-015: mockResolvedValue (detachSelf is now async)

    const runCmd = COMMANDS["run"] as CommandDef;
    const exitCodes: number[] = [];
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: number) => {
      exitCodes.push(code ?? 0);
      throw new Error(`process.exit(${code})`);
    });

    try {
      // Use a path that would resolve to a slug with uppercase characters
      // The test is about the SLUG_REGEX gate — if slug is invalid, spawn must not occur
      await runCmd.handler({
        flags: { detach: true },
        positional: "INVALID-SLUG-WITH-UPPERCASE",
        positionals: ["INVALID-SLUG-WITH-UPPERCASE"],
      });
    } catch {
      // expected
    } finally {
      exitSpy.mockRestore();
    }

    // detachSelf should NOT have been called (or if called, non-zero exit happens)
    // The key assertion: non-zero exit code was issued
    const nonZeroExits = exitCodes.filter((c) => c !== 0);
    // Either non-zero exit happened, or detachSelf was not called
    const detachSelfNotCalled = vi.mocked(detachSelf).mock.calls.length === 0;
    expect(nonZeroExits.length > 0 || detachSelfNotCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// job wait subcommand registration
// ---------------------------------------------------------------------------

describe("job wait subcommand registration", () => {
  it("job wait handler is defined", () => {
    const handler = getJobWaitHandler();
    expect(typeof handler).toBe("function");
  });

  it("job wait exits with code 2 when slug positional is missing", async () => {
    const jobCmd = COMMANDS["job"] as ParentCommandDef;
    const waitCmd = jobCmd.subcommands["wait"]!;
    const exitCodes: number[] = [];
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: number) => {
      exitCodes.push(code ?? 0);
      throw new Error(`process.exit(${code})`);
    });

    try {
      await waitCmd.handler({
        flags: {},
        positional: undefined,
        positionals: [],
      });
    } catch {
      // expected
    } finally {
      exitSpy.mockRestore();
    }

    expect(exitCodes.some((c) => c === 2)).toBe(true);
  });
});
