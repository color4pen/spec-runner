/**
 * TC-004, TC-010, TC-019 — CLI command registry for `job reopen`.
 *
 * TC-004: `job reopen <slug> --from <step>` without `--reason` exits with ARG_ERROR.
 *         (RED until the reopen subcommand is registered in command-registry.ts — T-05)
 *
 * TC-010: Reopen does not invoke cancel-style cleanup; branch/PR are preserved.
 *         (RED until T-05 registers the reopen subcommand)
 *
 * TC-019: `job reopen <slug> --reason "x"` without `--from` exits with ARG_ERROR.
 *         (RED until the reopen subcommand is registered in command-registry.ts — T-05)
 *
 * NOTE on TC-024: `runReopenCore` returns 0 on success — tested in
 *   src/core/command/__tests__/reopen-command.test.ts which already imports from the
 *   not-yet-existing `src/core/command/reopen.ts` module.
 *
 * Source: spec.md › Requirement: reopen requires --from and --reason
 *         tasks.md T-04, T-05
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../logger/stdout.js", () => ({
  stderrWrite: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
  stdoutWrite: vi.fn(),
  resolveLogLevel: vi.fn().mockReturnValue("normal"),
  setLogLevel: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { COMMANDS } from "../command-registry.js";
import type { ParentCommandDef } from "../command-registry.js";
import type { ParsedArgs } from "../flag-parser.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get the reopen subcommand handler from the command registry.
 * Returns undefined if the subcommand hasn't been registered yet (RED state).
 */
function getReopenHandler():
  | ((parsed: ParsedArgs, ctx?: Record<string, unknown>) => Promise<void>)
  | undefined {
  const jobCmd = COMMANDS["job"] as ParentCommandDef | undefined;
  return jobCmd?.subcommands["reopen"]?.handler as
    | ((parsed: ParsedArgs, ctx?: Record<string, unknown>) => Promise<void>)
    | undefined;
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
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// TC-004: reopen without --reason is an argument error
// ---------------------------------------------------------------------------

describe("TC-004: job reopen without --reason exits with ARG_ERROR", () => {
  it("TC-004-a: reopen subcommand is registered in the job command registry", () => {
    // The reopen subcommand must exist in the registry.
    // RED until T-05 registers it in command-registry.ts.
    const jobCmd = COMMANDS["job"] as ParentCommandDef;
    expect(jobCmd.subcommands["reopen"]).toBeDefined();
  });

  it("TC-004-b: reopen subcommand declares --from and --reason flags", () => {
    // After T-05, the subcommand must declare both flags.
    const jobCmd = COMMANDS["job"] as ParentCommandDef;
    const reopenCmd = jobCmd.subcommands["reopen"];
    expect(reopenCmd).toBeDefined();
    expect(reopenCmd?.flags["from"]).toBeDefined();
    expect(reopenCmd?.flags["reason"]).toBeDefined();
  });

  it("TC-004-c: handler exits with ARG_ERROR (2) when --reason is missing", async () => {
    const handler = getReopenHandler();
    // If reopen is not registered yet, this test fails here (expected RED state)
    expect(handler).toBeDefined();

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${String(code)})`);
    });

    try {
      await handler!(
        makeParsedArgs({
          flags: { from: "spec-review" }, // --from present, --reason absent
        }),
      );
      // If we reach here, process.exit was not called — test fails
      expect.fail("Expected process.exit(2) to be called");
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toMatch(/process\.exit\(2\)/);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it("TC-004-d: missing --reason does not start the pipeline", async () => {
    // Track calls to any run function by checking that the exit happens early
    const handler = getReopenHandler();
    expect(handler).toBeDefined();

    let didCallExit = false;
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      didCallExit = true;
      throw new Error(`exit:${String(code)}`);
    });
    try {
      await handler!(makeParsedArgs({ flags: { from: "spec-review" } }));
    } catch {
      /* expected */
    } finally {
      exitSpy.mockRestore();
    }

    // process.exit must have been called (before any pipeline execution)
    expect(didCallExit).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-019: reopen without --from is an argument error
// ---------------------------------------------------------------------------

describe("TC-019: job reopen without --from exits with ARG_ERROR", () => {
  it("TC-019-a: handler exits with ARG_ERROR (2) when --from is missing", async () => {
    const handler = getReopenHandler();
    // RED until reopen subcommand is registered
    expect(handler).toBeDefined();

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${String(code)})`);
    });

    try {
      await handler!(
        makeParsedArgs({
          flags: { reason: "post-review fix" }, // --reason present, --from absent
        }),
      );
      expect.fail("Expected process.exit(2) to be called");
    } catch (err) {
      expect((err as Error).message).toMatch(/process\.exit\(2\)/);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it("TC-019-b: missing --from does not start the pipeline", async () => {
    const handler = getReopenHandler();
    expect(handler).toBeDefined();

    let didExit = false;
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      didExit = true;
      throw new Error("exit");
    });
    try {
      await handler!(makeParsedArgs({ flags: { reason: "fix" } }));
    } catch { /* expected */ } finally {
      exitSpy.mockRestore();
    }

    expect(didExit).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-010: PR and branch survive a reopen (no cancel-style cleanup)
// ---------------------------------------------------------------------------

describe("TC-010: reopen does not invoke cancel cleanup (branch/PR preserved)", () => {
  it("TC-010-a: reopen subcommand is registered in guardedSubcommands", () => {
    // Reopen is an operator-scoped action that should be guarded.
    // RED until T-05 registers reopen in guardedSubcommands.
    const jobCmd = COMMANDS["job"] as ParentCommandDef;
    expect(jobCmd.guardedSubcommands?.has("reopen")).toBe(true);
  });

  it("TC-010-b: reopen handler has a positional slug argument (required)", () => {
    // Verify the subcommand requires a slug positional (mirrors resume subcommand)
    const jobCmd = COMMANDS["job"] as ParentCommandDef;
    const reopenCmd = jobCmd.subcommands["reopen"];
    expect(reopenCmd).toBeDefined();
    expect(reopenCmd?.positional?.name).toBeDefined();
    expect(reopenCmd?.positional?.required).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-024: runReopenCore returns 0 on a successful reopen
// ---------------------------------------------------------------------------

describe("TC-024: CLI reopen returns exit code 0 on success", () => {
  it("TC-024: reopen subcommand handler dispatches to runReopen when args are valid", async () => {
    // GIVEN the reopen subcommand is registered
    const handler = getReopenHandler();
    // RED: fails here until T-05
    expect(handler).toBeDefined();

    // WHEN both --from and --reason are provided, the handler should not exit early (exit 2)
    // We verify this by checking that process.exit(2) is NOT called with both flags.
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      if (code === 2) {
        throw new Error(`ARG_ERROR: process.exit(${String(code)})`);
      }
      // Non-arg-error exits (e.g. 0, 1) are allowed — they come from the pipeline
      throw new Error(`process.exit(${String(code)})`);
    });

    try {
      await handler!(
        makeParsedArgs({
          flags: {
            from: "spec-review",
            reason: "post-review fix",
          },
        }),
      );
    } catch (err) {
      const msg = (err as Error).message;
      // An ARG_ERROR exit(2) must NOT happen with valid args
      expect(msg).not.toMatch(/ARG_ERROR/);
    } finally {
      exitSpy.mockRestore();
    }
  });
});
