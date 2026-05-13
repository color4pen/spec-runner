import { spawn as nodeSpawn } from "node:child_process";
import type { SpawnOptions, ChildProcess } from "node:child_process";

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
