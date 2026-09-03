/**
 * Harness for exit contract snapshot tests.
 *
 * `runCase(caseDef, configureMocks)` executes a single exit contract case:
 *   1. Invokes `configureMocks()` to apply per-case mock setup (vi.mocked calls)
 *   2. Sets process.argv to ["node", "specrunner", ...argv]
 *   3. Spies on process.stdout.write, process.stderr.write, and process.exit
 *   4. Dynamically imports bin/specrunner.js and calls main()
 *   5. Returns the first snapshot captured by the process.exit spy
 *      (exitCode: null if main() returned without calling process.exit)
 *   6. Normalises environment-dependent values in output strings
 *
 * This file is imported by cli-exit-contract.test.ts, which sets up all vi.mock
 * declarations and passes the configureMocks callback with per-case behavior.
 */

import { vi } from "vitest";

export interface ExitContractSnapshot {
  exitCode: number | null;
  stdout: string[];
  stderr: string[];
}

const SENTINEL = "EXIT_CONTRACT_SENTINEL";

/**
 * Normalise absolute paths and environment-dependent values in output strings
 * so that snapshots are portable across machines.
 */
function normalise(lines: string[]): string[] {
  const cwd = process.cwd();
  return lines.map((line) =>
    line
      .replace(new RegExp(cwd.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&"), "g"), "<CWD>")
      .replace(/\/main\/repo/g, "<MAIN_WORKTREE>"),
  );
}

/**
 * Run a single exit contract case.
 *
 * @param argv - CLI arguments (without "node specrunner" prefix)
 * @param configureMocks - callback invoked to set per-case mock behaviours
 *   (called after restoring previous mock state but before dynamic import)
 */
export async function runCase(
  argv: string[],
  configureMocks: () => void,
): Promise<ExitContractSnapshot> {
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  let snapshot: ExitContractSnapshot | null = null;

  process.argv = ["node", "specrunner", ...argv];

  const stdoutSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: unknown) => {
      stdoutLines.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    });
  const stderrSpy = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((chunk: unknown) => {
      stderrLines.push(typeof chunk === "string" ? chunk : String(chunk));
      return true;
    });
  const exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
    if (snapshot === null) {
      snapshot = {
        exitCode: typeof code === "number" ? code : Number(code ?? 0),
        stdout: normalise([...stdoutLines]),
        stderr: normalise([...stderrLines]),
      };
    }
    throw new Error(SENTINEL);
  });

  // Apply per-case mock setup
  configureMocks();

  try {
    const mod = await import("../../../bin/specrunner.js");
    await mod.main();
    // main() returned without process.exit — capture final state
    if (snapshot === null) {
      snapshot = {
        exitCode: null,
        stdout: normalise([...stdoutLines]),
        stderr: normalise([...stderrLines]),
      };
    }
  } catch (err) {
    if (!(err instanceof Error) || err.message !== SENTINEL) {
      throw err;
    }
    // sentinel caught — snapshot already captured above
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    exitSpy.mockRestore();
  }

  return snapshot!;
}
