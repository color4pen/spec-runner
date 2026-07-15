/**
 * CLI entry point for `specrunner job attach --branch <branch>`.
 *
 * Flow (ADR-20260715 D7):
 *   1. Worktree guard (reject if running from inside a specrunner worktree).
 *   2. Config / token / repo resolution.
 *   3. Runtime check (local only).
 *   4. runAttachVerification: fetch → read → verify (no local state created yet).
 *   5. On success: setupWorkspace with attachCheckpoint (creates worktree + sidecar).
 *   6. Print success and next-step hint (does NOT start pipeline).
 */
import * as path from "node:path";
import { detectSpecrunnerWorktree } from "../core/worktree/detection.js";
import { runAttachVerification } from "../core/attach/orchestrator.js";
import { loadConfig } from "../config/store.js";
import { resolveGitHubToken } from "../core/credentials/github.js";
import { getOriginInfo } from "../git/remote.js";
import { resolveGitHubHost } from "../config/github-host.js";
import { createTransportAuth } from "../git/transport-auth.js";
import { spawnCommand } from "../util/spawn.js";
import { resolveRepoRoot } from "../util/repo-root.js";
import {
  SpecRunnerError,
  worktreeGuardError,
  attachRuntimeUnsupportedError,
} from "../errors.js";
import { logResult, logError, stderrWrite, type LogLevel, setLogLevel } from "../logger/stdout.js";
import { LocalRuntime } from "../core/runtime/local.js";
import { createGitHubClient } from "../adapter/github/github-client.js";
import { resolveGitHubApiBaseUrl } from "../config/github-host.js";

export interface RunAttachOptions {
  branch: string;
  cwd: string;
  logLevel?: LogLevel;
}

/**
 * Run the `job attach --branch <branch>` command.
 * Returns exit code: 0 (success), 1 (error), 2 (arg error).
 */
export async function runAttach(opts: RunAttachOptions): Promise<number> {
  setLogLevel(opts.logLevel ?? "default");
  const cwd = opts.cwd;

  // 1. Worktree guard: reject if running from inside a specrunner worktree
  const detection = await detectSpecrunnerWorktree(cwd);
  if (detection.isSpecrunnerWorktree) {
    const mainPath = detection.mainCheckoutPath ?? path.dirname(cwd);
    const err = worktreeGuardError("job attach", mainPath);
    logError(err.message);
    stderrWrite(`Hint: ${err.hint}`);
    return err.exitCode;
  }

  // 2. Config / token / repo resolution
  let config: import("../config/schema.js").SpecRunnerConfig;
  let githubToken: string;
  let repoRoot: string;
  let owner: string;
  let repoName: string;

  try {
    repoRoot = (await resolveRepoRoot(cwd)) ?? cwd;
    config = await loadConfig(repoRoot);
  } catch (err: unknown) {
    const e = err instanceof SpecRunnerError ? err : null;
    logError(e ? e.message : `Failed to load config: ${(err as Error).message}`);
    if (e) stderrWrite(`Hint: ${e.hint}`);
    return 1;
  }

  // 3. Runtime check (local only)
  if (config.runtime !== "local") {
    const err = attachRuntimeUnsupportedError(config.runtime ?? "unknown");
    logError(err.message);
    stderrWrite(`Hint: ${err.hint}`);
    return err.exitCode;
  }

  try {
    const githubHost = resolveGitHubHost(config.github);
    const resolved = await resolveGitHubToken(process.env as Record<string, string | undefined>, { host: githubHost });
    githubToken = resolved.token;
    const originInfo = await getOriginInfo(cwd, githubHost);
    owner = originInfo.owner;
    repoName = originInfo.name;
  } catch (err: unknown) {
    const e = err instanceof SpecRunnerError ? err : null;
    logError(e ? e.message : `Setup failed: ${(err as Error).message}`);
    if (e) stderrWrite(`Hint: ${e.hint}`);
    return 1;
  }

  // 4. Transport-auth-wrapped spawn + fetch → read → verify
  const transportAuth = createTransportAuth({ token: githubToken, cwd: repoRoot });
  const spawnFn = transportAuth.wrapSpawn(spawnCommand);

  let verified: import("../core/attach/verify-checkpoint.js").VerifiedCheckpoint;
  try {
    verified = await runAttachVerification({
      cwd: repoRoot,
      branch: opts.branch,
      spawnFn,
      expectedRepo: { owner, name: repoName },
    });
  } catch (err: unknown) {
    if (err instanceof SpecRunnerError) {
      logError(err.message);
      stderrWrite(`Hint: ${err.hint}`);
      return err.exitCode;
    }
    logError(`Attach verification failed: ${(err as Error).message}`);
    return 1;
  }

  // 5. Materialize worktree from checkpoint (verification succeeded)
  const githubApiBaseUrl = resolveGitHubApiBaseUrl(config.github);
  const githubClient = createGitHubClient(fetch, githubToken, githubApiBaseUrl);
  const runtime = new LocalRuntime({
    cwd: repoRoot,
    githubClient,
    githubToken,
    owner,
    repo: repoName,
    workspaceSetup: config.workspace?.setup,
  });

  const baseBranch = verified.state.request.baseBranch ?? "main";

  try {
    await runtime.setupWorkspace(verified.slug, verified.jobId, {
      attachCheckpoint: {
        branch: verified.branch,
        checkpointRef: `origin/${verified.branch}`,
      },
      baseBranch,
    });
  } catch (err: unknown) {
    if (err instanceof SpecRunnerError) {
      logError(err.message);
      stderrWrite(`Hint: ${err.hint}`);
      return err.exitCode;
    }
    logError(`Failed to materialize worktree: ${(err as Error).message}`);
    return 1;
  }

  // 6. Success — print next-step hint (do NOT resume pipeline)
  logResult(`Attached job '${verified.slug}' (jobId: ${verified.jobId}) from branch '${verified.branch}'.`);
  stderrWrite(`Run 'specrunner job resume ${verified.slug}' to resume the pipeline.`);
  return 0;
}
