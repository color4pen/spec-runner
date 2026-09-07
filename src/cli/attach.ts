/**
 * CLI entry point for `specrunner job attach --branch <branch>`.
 *
 * Flow (design.md D1–D2 / remote-checkpoint-publish-attach-closure):
 *   1. Worktree guard (reject if running from inside a specrunner worktree).
 *   2. Config / token / repo resolution.
 *   3. Runtime check (local only).
 *   4. runAttachVerification: fetch → OID resolution → read(OID) → verify(OID).
 *      No local state is created in this phase.
 *   5. On success: setupWorkspace with attachCheckpoint using verified.checkpointOid
 *      (the OID that was verified — never re-evaluates origin/<branch>).
 *   6. Print success and next-step hint (does NOT start pipeline).
 *
 * B-19: GitHub token resolution and client construction are confined to
 * src/cli/github-composition.ts. attach.ts delegates to composeGitHubIntegration
 * and composeGitHubIntegrationForJob.
 */
import * as path from "node:path";
import { detectSpecrunnerWorktree } from "../core/worktree/detection.js";
import { runAttachVerification } from "../core/attach/orchestrator.js";
import { attachQuiescentPolicy } from "../core/attach/checkpoint-policy.js";
import { loadConfig } from "../config/store.js";
import { getOriginUrl, normalizeOriginIdentity } from "../git/remote.js";
import { createTransportAuth } from "../git/transport-auth.js";
import { spawnCommand } from "../util/spawn.js";
import {
  SpecRunnerError,
  EXIT_CODE,
  worktreeGuardError,
  attachRuntimeUnsupportedError,
} from "../errors.js";
import type { ParsedArgs } from "./flag-parser.js";
import type { CommandContext } from "./command-context.js";
import { logResult, logError, stderrWrite, resolveLogLevel, type LogLevel, setLogLevel } from "../logger/stdout.js";
import { LocalRuntime } from "../core/runtime/local.js";
import { composeGitHubIntegration, composeGitHubIntegrationForJob } from "./github-composition.js";

export interface RunAttachOptions {
  branch: string;
  /** Invoker working directory — used for worktree guard and origin info. */
  cwd: string;
  /**
   * Dispatch-resolved repo root. When provided (production dispatch path),
   * this is used for config load, transport auth, and runtime setup.
   * Falls back to cwd when not provided (direct call in tests).
   */
  repoRoot?: string;
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
  // repoRoot is dispatch-injected (opts.repoRoot) or falls back to cwd for direct callers.
  const repoRoot = opts.repoRoot ?? cwd;

  let config: import("../config/schema.js").SpecRunnerConfig;

  try {
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

  // Resolve GitHub integration from invoker config (for transport auth + fetch)
  let githubToken: string | undefined;
  let owner: string = "";
  let repoName: string = "";
  let invokerOrigin: import("../state/schema/types.js").RepositoryOrigin | undefined;

  try {
    const composition = await composeGitHubIntegration(
      config,
      cwd,
      process.env as Record<string, string | undefined>,
    );
    githubToken = composition.githubToken;
    invokerOrigin = composition.origin;
    if (composition.enabled && composition.repository) {
      owner = composition.repository.owner;
      repoName = composition.repository.name;
    }
  } catch (err: unknown) {
    const e = err instanceof SpecRunnerError ? err : null;
    logError(e ? e.message : `Setup failed: ${(err as Error).message}`);
    if (e) stderrWrite(`Hint: ${e.hint}`);
    return 1;
  }

  // If composeGitHubIntegration did not resolve an origin (e.g. GitHub-disabled path
  // where resolveJobGitHubIntegration may not call getOriginUrl), resolve it here
  // as a best-effort fallback so GitHub-disabled attach can use digest comparison.
  if (!invokerOrigin) {
    try {
      const rawUrl = await getOriginUrl(repoRoot);
      invokerOrigin = normalizeOriginIdentity(rawUrl);
    } catch {
      // best-effort; invokerOrigin stays undefined
    }
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
      // T-10: pass both github and origin identity so verifyCheckpoint can
      // branch on the checkpoint's githubIntegration contract.
      expectedRepo: {
        github: owner && repoName ? { owner, name: repoName } : undefined,
        origin: invokerOrigin,
      },
      policy: attachQuiescentPolicy,
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
  // Use the checkpoint's contract (not the invoker's config) for the LocalRuntime.
  // This preserves the job's original integration state.
  const checkpointEnabled = verified.state.githubIntegration?.enabled ?? true;
  const { githubClient: checkpointGithubClient, githubToken: checkpointToken } =
    await composeGitHubIntegrationForJob({
      enabled: checkpointEnabled,
      config,
      env: process.env as Record<string, string | undefined>,
    });

  // Resolve owner/repo from the checkpoint state (for enabled jobs)
  const checkpointOwner = verified.state.repository?.owner ?? "";
  const checkpointRepo = verified.state.repository?.name ?? "";

  const runtime = new LocalRuntime({
    cwd: repoRoot,
    githubClient: checkpointGithubClient,
    githubToken: checkpointToken,
    owner: checkpointOwner,
    repo: checkpointRepo,
    workspaceSetup: config.workspace?.setup,
  });

  const baseBranch = verified.state.request.baseBranch ?? "main";

  try {
    // D2: use verified.checkpointOid (the OID resolved during verification)
    // so materialize checks out the exact commit — not the symbolic origin/<branch>
    // which could have advanced since verification.
    await runtime.setupWorkspace(verified.slug, verified.jobId, {
      attachCheckpoint: {
        branch: verified.branch,
        checkpointRef: verified.checkpointOid,
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
  if (verified.state.status === "awaiting-archive") {
    // Use the checkpoint's saved contract (not the current invoker config) for the hint.
    // GitHub-disabled jobs have no PR to merge, so --with-merge is not applicable.
    const checkpointGithubEnabled = verified.state.githubIntegration?.enabled ?? true;
    if (checkpointGithubEnabled) {
      stderrWrite(`Run 'specrunner job archive ${verified.slug} --with-merge' to take the job in.`);
    } else {
      stderrWrite(`Run 'specrunner job archive ${verified.slug}' to archive this job (GitHub integration is disabled; the remote feature branch will be preserved).`);
    }
  } else {
    stderrWrite(`Run 'specrunner job resume ${verified.slug}' to resume the pipeline.`);
  }
  return 0;
}

/**
 * CLI handler for `specrunner job attach --branch <branch>`.
 * Returns the exit code; process termination is owned by the dispatch boundary.
 */
export async function handleJobAttach(parsed: ParsedArgs, ctx?: CommandContext): Promise<number> {
  const branch = parsed.flags["branch"] as string | undefined;
  if (!branch) {
    logError("--branch <branch> is required for 'job attach'.");
    return EXIT_CODE.ARG_ERROR;
  }
  const logLevel = resolveLogLevel({
    quiet: !!parsed.flags["quiet"],
    verbose: !!parsed.flags["verbose"],
    debug: !!parsed.flags["debug"],
  });
  return await runAttach({
    branch,
    cwd: ctx!.invokerCwd,
    repoRoot: ctx!.repoRoot!,
    logLevel,
  });
}
