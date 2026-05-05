import { spawn as nodeSpawn } from "node:child_process";
import type { SpawnOptions, ChildProcess } from "node:child_process";

export type SpawnFn = (bin: string, args: string[], opts: SpawnOptions) => ChildProcess;

export const defaultSpawnFn: SpawnFn = nodeSpawn;

function runSubprocess(
  spawnFn: SpawnFn,
  bin: string,
  args: string[],
  opts: { cwd: string },
): Promise<{ stdout: string; stderr: string }> {
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
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${bin} exited with code ${code}: ${stderr.slice(0, 500)}`));
      }
    });

    child.stdin?.end();
  });
}

export async function gitExec(
  spawnFn: SpawnFn,
  cwd: string,
  args: string[],
): Promise<string | null> {
  try {
    const { stdout } = await runSubprocess(spawnFn, "git", args, { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}
