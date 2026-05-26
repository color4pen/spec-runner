/**
 * Verification command normalization and execution utilities.
 *
 * Implements the language-agnostic commands path for runVerification().
 * Commands are executed via `sh -c <command>` (POSIX shell, Windows not supported).
 */
import { spawn } from "node:child_process";
import type { VerificationCommand } from "../../config/schema.js";

/** Normalized form of a single verification command entry. */
export interface NormalizedCommand {
  /** Display label. When absent, the command string itself is used as the label. */
  name: string | undefined;
  /** Shell command to execute via `sh -c`. */
  run: string;
}

/**
 * Normalize a raw VerificationCommand array into NormalizedCommand[].
 *
 * Normalization rules:
 * - string `"cmd"` → `{ name: undefined, run: "cmd" }`
 * - `{ run: "cmd" }` → `{ name: undefined, run: "cmd" }`
 * - `{ name: "label", run: "cmd" }` → `{ name: "label", run: "cmd" }`
 */
export function normalizeCommands(raw: VerificationCommand[]): NormalizedCommand[] {
  return raw.map((entry) => {
    if (typeof entry === "string") {
      return { name: undefined, run: entry };
    }
    return { name: entry.name, run: entry.run };
  });
}

/**
 * Spawn a shell command via `sh -c <command>` and collect stdout/stderr.
 * Returns the exit code and collected output.
 *
 * Uses POSIX shell (`sh -c`), which supports pipes, redirects, glob expansion,
 * environment variable expansion, and command chaining (`&&`, `||`, `;`).
 * Windows is not supported (POSIX shell assumed).
 */
export function spawnCommand(
  command: string,
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", command], {
      cwd,
      shell: false,
      env: process.env,
    });

    let stdoutBuf = "";
    let stderrBuf = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: stdoutBuf,
        stderr: stderrBuf,
      });
    });

    child.on("error", (err) => {
      resolve({
        exitCode: 1,
        stdout: "",
        stderr: err.message,
      });
    });
  });
}
