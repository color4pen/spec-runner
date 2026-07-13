/**
 * Shared subprocess spawning utility.
 * Extracted from src/core/pr-create/runner.ts for reuse across finish and other modules.
 *
 * Uses node:child_process.spawn (NOT bun:* / Bun.*) per project rules.
 */
import { spawn } from "node:child_process";
import { stripSecrets } from "./env-filter.js";

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

// ─── Background (resident) process support ───────────────────────────────────

/**
 * Handle returned by spawnBackground.
 * kill() is idempotent and never throws.
 */
export interface BackgroundProcessHandle {
  readonly pid: number | undefined;
  kill(): void;
}

/**
 * Options for spawnBackground.
 */
export interface SpawnBackgroundOptions {
  cwd: string;
  env?: Record<string, string | undefined>;
  onError?: (err: Error) => void;
}

/**
 * SpawnBackgroundFn type for dependency injection in tests.
 */
export type SpawnBackgroundFn = (
  cmd: string,
  args: string[],
  opts: SpawnBackgroundOptions,
) => BackgroundProcessHandle;

/**
 * Spawn a long-lived background process and return a handle to kill it.
 * Unlike spawnCommand, this does NOT await process exit — it returns immediately
 * with a kill handle so callers can terminate the process at any time.
 *
 * Env follows the same B-6 strip point as spawnCommand:
 *   stripSecrets(process.env) + optional opts.env overlay.
 *
 * The child process is unref()'d so it never keeps the CLI event loop alive.
 * The error listener is attached synchronously (before return) to prevent an
 * async ENOENT from becoming an unhandled error event.
 * kill() is idempotent and never throws.
 */
export function spawnBackground(
  cmd: string,
  args: string[],
  opts: SpawnBackgroundOptions,
): BackgroundProcessHandle {
  const env: Record<string, string> = opts.env
    ? { ...stripSecrets(process.env as Record<string, string | undefined>), ...opts.env } as Record<string, string>
    : stripSecrets(process.env as Record<string, string | undefined>) as Record<string, string>;

  const proc = spawn(cmd, args, {
    cwd: opts.cwd,
    shell: false,
    stdio: "ignore",
    env,
  });

  // Attach error handler synchronously to prevent unhandled error events
  proc.on("error", (err: Error) => {
    opts.onError?.(err);
  });

  // Unref so the child never keeps the CLI event loop alive
  proc.unref();

  let killed = false;

  return {
    get pid() { return proc.pid; },
    kill() {
      if (killed) return;
      killed = true;
      try { proc.kill("SIGTERM"); } catch { /* best-effort */ }
    },
  };
}

/**
 * No-op SpawnBackgroundFn. Returns a handle that spawns nothing and whose
 * kill() is a no-op. This is the default background-spawn for LocalRuntime, so
 * merely constructing a runtime (e.g. in tests) never spawns a real process.
 * The real spawnBackground is injected only at the composition root
 * (createRuntime) for production job execution.
 */
export const noopSpawnBackground: SpawnBackgroundFn = () => ({
  pid: undefined,
  kill() {},
});

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
      env: opts.env
        ? { ...stripSecrets(process.env as Record<string, string | undefined>), ...opts.env } as Record<string, string>
        : stripSecrets(process.env as Record<string, string | undefined>) as Record<string, string>,
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
