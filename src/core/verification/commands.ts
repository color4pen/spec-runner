/**
 * Verification command normalization and execution utilities.
 *
 * Implements the language-agnostic commands path for runVerification().
 * Commands are executed via `sh -c <command>` (POSIX shell, Windows not supported).
 */
import { spawn } from "node:child_process";
import type { VerificationCommand } from "../../config/schema.js";
import { stripSecrets } from "../../util/env-filter.js";

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
 *
 * PATH construction (in order):
 *   1. `<cwd>/node_modules/.bin` — locally-installed binaries always first.
 *   2. `<root>/node_modules/.bin` — lockfile root binaries (hoisted in monorepo), only when root !== cwd.
 *   3. Original `env.PATH` (if set).
 *
 * @param command - Shell command to execute via `sh -c`.
 * @param cwd - Working directory for the child process.
 * @param env - Environment variables (secrets are stripped before passing to child).
 * @param root - Lockfile root directory. When provided and different from `cwd`,
 *   its `node_modules/.bin` is appended to PATH after `cwd/node_modules/.bin`.
 *   Defaults to `cwd` (no additional bin path).
 */
export function spawnCommand(
  command: string,
  cwd: string,
  env: Record<string, string | undefined>,
  root?: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const cwdBin = `${cwd}/node_modules/.bin`;
  const rootBin = root !== undefined && root !== cwd ? `${root}/node_modules/.bin` : undefined;
  const pathParts = [cwdBin, ...(rootBin ? [rootBin] : []), ...(env.PATH ? [env.PATH] : [])];
  const pathWithLocalBin = pathParts.join(":");
  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", command], {
      cwd,
      shell: false,
      env: { ...stripSecrets(env), PATH: pathWithLocalBin },
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
