/**
 * Shared gh pr create helper with --body-file temp-file pattern.
 * Extracted from src/core/pr-create/runner.ts for reuse in finish.
 *
 * TC-037: --body-file tempfile with try/finally cleanup
 * TC-064: title, base, head args
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type { SpawnFn } from "../../util/spawn.js";

export interface GhPrCreateInput {
  title: string;
  body: string;
  base: string;
  head: string;
  cwd: string;
  spawn: SpawnFn;
  /** GitHub token to inject as GITHUB_TOKEN env var for gh CLI subprocess. */
  githubToken?: string;
}

export type GhPrCreateResult =
  | { ok: true; url: string }
  | { ok: false; stderr: string };

/**
 * Run `gh pr create` with body written to a tempfile (--body-file).
 * Tempfile is cleaned up in try/finally.
 * Injects GITHUB_TOKEN env var for gh CLI when githubToken is provided.
 */
export async function runGhPrCreate(input: GhPrCreateInput): Promise<GhPrCreateResult> {
  const tmpFile = path.join(os.tmpdir(), `specrunner-archive-body-${randomUUID()}.md`);
  await fs.writeFile(tmpFile, input.body, "utf-8");

  const spawnEnv = input.githubToken ? { GITHUB_TOKEN: input.githubToken } : undefined;

  let result: { exitCode: number | null; stdout: string; stderr: string };
  try {
    result = await input.spawn(
      "gh",
      [
        "pr", "create",
        "--title", input.title,
        "--body-file", tmpFile,
        "--base", input.base,
        "--head", input.head,
      ],
      { cwd: input.cwd, env: spawnEnv },
    );
  } finally {
    await fs.unlink(tmpFile).catch(() => undefined);
  }

  if (result.exitCode !== 0) {
    return { ok: false, stderr: result.stderr };
  }

  // Extract PR URL from stdout
  const urlMatch = /https:\/\/github\.com\/[^\s]+\/pull\/\d+/.exec(result.stdout.trim());
  if (!urlMatch) {
    return {
      ok: false,
      stderr: `gh pr create succeeded but could not extract PR URL from output: ${result.stdout}`,
    };
  }

  return { ok: true, url: urlMatch[0] };
}
