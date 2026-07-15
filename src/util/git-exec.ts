import { spawn as nodeSpawn } from "node:child_process";
import type { SpawnOptions, ChildProcess } from "node:child_process";
import { stripSecrets } from "./env-filter.js";

export type SpawnFn = (bin: string, args: string[], opts: SpawnOptions) => ChildProcess;

export const defaultSpawnFn: SpawnFn = nodeSpawn;

export function runSubprocess(
  spawnFn: SpawnFn,
  bin: string,
  args: string[],
  opts: { cwd: string },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawnFn(bin, args, {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: stripSecrets(process.env as Record<string, string | undefined>) as Record<string, string>,
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });

    child.stdin?.end();
  });
}

/**
 * Run a git command and return trimmed stdout, or null on failure.
 */
export async function gitExec(
  spawnFn: SpawnFn,
  cwd: string,
  args: string[],
): Promise<string | null> {
  try {
    const { stdout, exitCode } = await runSubprocess(spawnFn, "git", args, { cwd });
    if (exitCode !== 0) return null;
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Run a git command and return exit code (0 = success, non-zero = failure).
 * Does not throw.
 */
export async function gitExecExitCode(
  spawnFn: SpawnFn,
  cwd: string,
  args: string[],
): Promise<number> {
  try {
    const { exitCode } = await runSubprocess(spawnFn, "git", args, { cwd });
    return exitCode;
  } catch {
    return 1;
  }
}

/**
 * Run a git command and return spawn success status and exit code as a plain object.
 * Separates spawn errors (ok: false, exitCode: -1) from git command exit codes
 * (ok: true, exitCode: n). Never throws.
 *
 * Use this instead of gitExecExitCode when the caller needs to distinguish between
 * a spawn failure and a non-zero git exit code (e.g. `git diff --cached --quiet`
 * where exit 1 means "changes present" and exit ≥2 means "git error").
 */
export async function gitExecResult(
  spawnFn: SpawnFn,
  cwd: string,
  args: string[],
): Promise<{ ok: boolean; exitCode: number }> {
  try {
    const { exitCode } = await runSubprocess(spawnFn, "git", args, { cwd });
    return { ok: true, exitCode };
  } catch {
    return { ok: false, exitCode: -1 };
  }
}
