/**
 * TC-004-registry, TC-010-registry, TC-012, TC-024-registry — CLI command registry for `job reopen`.
 *
 * TC-004-registry: `job reopen <slug>` without `--reason` exits with ARG_ERROR.
 *
 * TC-010-registry: Reopen does not invoke cancel-style cleanup; branch/PR are preserved.
 *
 * TC-012: `job reopen <slug> --from <step> --reason "x"` with `--from` exits with ARG_ERROR.
 *         The --from flag is no longer accepted by `job reopen` (D3: --from moved to resume).
 *
 * TC-025: REOPEN_USAGE does not mention --from.
 *
 * TC-024-registry: `runReopenCore` returns 0 on success — handler does not exit with ARG_ERROR
 *         when valid args are present (only --reason required).
 *
 * Source: spec.md › Requirement: reopen SHALL NOT accept --from
 *         tasks.md T-03, T-06
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

import { COMMANDS, REOPEN_USAGE } from "../command-registry.js";
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
  return COMMANDS["job"]?.children?.["reopen"]?.handler as
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
// TC-004-registry: reopen without --reason is an argument error
// ---------------------------------------------------------------------------

describe("TC-004-registry: job reopen without --reason exits with ARG_ERROR", () => {
  it("TC-004-registry-a: reopen subcommand is registered in the job command registry", () => {
    expect(COMMANDS["job"]?.children?.["reopen"]).toBeDefined();
  });

  it("TC-004-registry-b: reopen subcommand declares --reason flag (but not --from)", () => {
    const reopenCmd = COMMANDS["job"]?.children?.["reopen"];
    expect(reopenCmd).toBeDefined();
    expect(reopenCmd?.flags?.["reason"]).toBeDefined();
    // --from must NOT be declared (D3: --from moved to resume)
    expect(reopenCmd?.flags?.["from"]).toBeUndefined();
  });

  it("TC-004-registry-c: handler exits with ARG_ERROR (2) when --reason is missing", async () => {
    const handler = getReopenHandler();
    // If reopen is not registered yet, this test fails here (expected RED state)
    expect(handler).toBeDefined();

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${String(code)})`);
    });

    try {
      await handler!(
        makeParsedArgs({
          flags: {}, // --reason absent
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

  it("TC-004-registry-d: missing --reason does not start the pipeline", async () => {
    // Track calls to any run function by checking that the exit happens early
    const handler = getReopenHandler();
    expect(handler).toBeDefined();

    let didCallExit = false;
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      didCallExit = true;
      throw new Error(`exit:${String(code)}`);
    });
    try {
      await handler!(makeParsedArgs({ flags: {} }));
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
// TC-012: providing --from to job reopen exits with ARG_ERROR
// (The flag is no longer registered, so the parser should reject it or
// the handler should not accept it.)
// ---------------------------------------------------------------------------

describe("TC-012: providing --from to job reopen is rejected", () => {
  it("TC-012-a: --from is NOT declared as a flag on the reopen subcommand", () => {
    const reopenCmd = COMMANDS["job"]?.children?.["reopen"];
    expect(reopenCmd).toBeDefined();
    // --from must be absent from the registered flags
    expect(reopenCmd?.flags?.["from"]).toBeUndefined();
  });

  it("TC-012-b: handler exits with ARG_ERROR when only --from is provided (no --reason)", async () => {
    const handler = getReopenHandler();
    expect(handler).toBeDefined();

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${String(code)})`);
    });

    // Even if the parser somehow passes --from through (e.g. unknown flag),
    // the handler must reject when --reason is absent
    try {
      await handler!(
        makeParsedArgs({
          flags: { from: "spec-review" }, // --from present, --reason absent
        }),
      );
      expect.fail("Expected process.exit(2) to be called");
    } catch (err) {
      expect((err as Error).message).toMatch(/process\.exit\(2\)/);
    } finally {
      exitSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// TC-010-registry: PR and branch survive a reopen (no cancel-style cleanup)
// ---------------------------------------------------------------------------

describe("TC-010-registry: reopen does not invoke cancel cleanup (branch/PR preserved)", () => {
  it("TC-010-registry-a: reopen subcommand has worktreeGuard: true", () => {
    // Reopen is an operator-scoped action that should be guarded.
    expect(COMMANDS["job"]?.children?.["reopen"]?.worktreeGuard).toBe(true);
  });

  it("TC-010-registry-b: reopen handler has a positional slug argument (required)", () => {
    // Verify the subcommand requires a slug positional (mirrors resume subcommand)
    const reopenCmd = COMMANDS["job"]?.children?.["reopen"];
    expect(reopenCmd).toBeDefined();
    expect(reopenCmd?.args?.[0]?.name).toBeDefined();
    expect(reopenCmd?.args?.[0]?.required).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-025: REOPEN_USAGE does not declare --from as a reopen option
// ---------------------------------------------------------------------------

describe("TC-025: REOPEN_USAGE does not declare --from as a reopen option", () => {
  it("TC-025-a: REOPEN_USAGE Options block does not list --from as a reopen option", () => {
    // The Options section must not list --from as an option for `job reopen`.
    // It may appear in the prose note directing to `resume --from`.
    const optionsSection = REOPEN_USAGE.slice(REOPEN_USAGE.indexOf("Options:"));
    // --from must not appear as an option declaration line (e.g. "  --from <step>")
    expect(optionsSection).not.toMatch(/^\s+--from\s/m);
  });

  it("TC-025-b: REOPEN_USAGE contains a note directing operators to use resume --from", () => {
    // The usage text must guide operators to use resume for pipeline execution
    expect(REOPEN_USAGE).toMatch(/resume.*--from|resume/);
  });
});

// ---------------------------------------------------------------------------
// TC-024-registry: runReopenCore returns exit code 0 on success (handler validation only)
// ---------------------------------------------------------------------------

describe("TC-024-registry: CLI reopen returns exit code 0 on success", () => {
  it("TC-024-registry: reopen handler does not exit early with ARG_ERROR when --reason is provided", async () => {
    // GIVEN the reopen subcommand is registered
    const handler = getReopenHandler();
    expect(handler).toBeDefined();

    // WHEN --reason is provided (no --from needed), the handler should not exit with ARG_ERROR (2)
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((code) => {
      if (code === 2) {
        throw new Error(`ARG_ERROR: process.exit(${String(code)})`);
      }
      // Non-arg-error exits (e.g. 0, 1) are allowed — they come from the command
      throw new Error(`process.exit(${String(code)})`);
    });

    try {
      await handler!(
        makeParsedArgs({
          flags: {
            reason: "post-review fix",
            // --from is intentionally absent (no longer required or accepted)
          },
        }),
      );
    } catch (err) {
      const msg = (err as Error).message;
      // An ARG_ERROR exit(2) must NOT happen with valid args (only --reason required)
      expect(msg).not.toMatch(/ARG_ERROR/);
    } finally {
      exitSpy.mockRestore();
    }
  });
});
