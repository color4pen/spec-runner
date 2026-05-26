/**
 * Shared subprocess spawning utility.
 * Extracted from src/core/pr-create/runner.ts for reuse across finish and other modules.
 *
 * Uses node:child_process.spawn (NOT bun:* / Bun.*) per project rules.
 */
import { spawn } from "node:child_process";

export interface SpawnResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface SpawnOptions {
  cwd: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}

/**
 * SpawnFn type for dependency injection in tests.
 */
export type SpawnFn = (
  cmd: string,
  args: string[],
  opts: SpawnOptions,
) => Promise<SpawnResult>;

/**
 * Spawn a command and collect stdout/stderr.
 * Resolves with { exitCode, stdout, stderr }.
 * Never throws on non-zero exit — callers check exitCode.
 */
export function spawnCommand(
  cmd: string,
  args: string[],
  opts: SpawnOptions,
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: opts.cwd,
      shell: false,
      env: opts.env ? { ...process.env, ...opts.env } as Record<string, string> : process.env as Record<string, string>,
    });

    let stdout = "";
    let stderr = "";

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    if (opts.timeoutMs !== undefined) {
      timeoutHandle = setTimeout(() => {
        proc.kill("SIGTERM");
      }, opts.timeoutMs);
    }

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    // Handle spawn errors (e.g. ENOENT when executable not found).
    // Without this handler, Node.js emits an uncaught exception.
    proc.on("error", (err) => {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      resolve({ exitCode: null, stdout, stderr: err.message });
    });
    proc.on("close", (code) => {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
      resolve({ exitCode: code, stdout, stderr });
    });
  });
}
