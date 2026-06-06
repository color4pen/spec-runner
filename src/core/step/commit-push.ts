import type { AgentStep } from "./types.js";
import type { JobState } from "../../state/schema.js";
import type { PipelineDeps } from "../types.js";
import type { EventBus } from "../event/event-bus.js";
import { gitExec, gitExecExitCode, type SpawnFn } from "../../util/git-exec.js";
import type { SpawnFn as PipelineSpawnFn } from "../../util/spawn.js";
import { stderrWrite } from "../../logger/stdout.js";
import { pushFailedError } from "../../errors.js";

/** Infrastructure deps for commit/push operations. */
export interface CommitPushInfra {
  spawnFn: SpawnFn;
  sleepFn: (ms: number) => Promise<void>;
  events: EventBus;
}

/**
 * Stage all changes, commit, and push to origin.
 *
 * tool-driven-step-completion: requiresCommit guard removed.
 * New behavior:
 * - git add -A
 * - git diff --cached --quiet (exit 0 = no changes)
 * - if no changes:
 *   - compare headBeforeStep with current HEAD
 *   - if HEAD advanced (agent self-committed): push only, log detection message
 *   - otherwise: silently return (no commit needed, step completed via tool)
 * - git commit -m "${step.name}: ${slug}"
 * - git push origin ${branch} — retry once after 5s on failure
 * - if second push fails: throw pushFailedError
 * - emit commit:push on success
 */
export async function commitAndPush(
  step: AgentStep,
  state: JobState,
  deps: PipelineDeps,
  headBeforeStep: string | null,
  infra: CommitPushInfra,
): Promise<void> {
  const cwd = deps.cwd ?? process.cwd();
  const branch = state.branch ?? "";
  const slug = deps.slug;

  // Stage all changes. If git add fails (not a git repo, exit 128, etc.), silently skip.
  const addExitCode = await gitExecExitCode(infra.spawnFn, cwd, ["add", "-A"]);
  if (addExitCode !== 0) {
    // git is non-functional in this directory (e.g., not a git repo).
    // Silently skip — no requiresCommit guard anymore.
    return;
  }

  // Check if there are staged changes.
  // `git diff --cached --quiet` exits 0 when no staged changes, 1 when there are staged changes.
  const diffExitCode = await gitExecExitCode(infra.spawnFn, cwd, ["diff", "--cached", "--quiet"]);
  const hasChanges = diffExitCode === 1;

  if (!hasChanges) {
    // Check if HEAD advanced (agent self-committed before pipeline commit).
    const headAfterStep = await gitExec(infra.spawnFn, cwd, ["rev-parse", "HEAD"]);
    if (headBeforeStep && headAfterStep && headAfterStep !== headBeforeStep) {
      // Agent authored commit(s) since step start — push the existing commits as-is.
      stderrWrite("Detected agent-authored commit(s) since step start; skipping pipeline commit and pushing as-is.\n");
      await pushOnly(branch, cwd, step.name, infra);
      return;
    }
    // No changes and no agent self-commit — silently skip (step completed via tool, no file writes needed)
    return;
  }

  // Commit
  const commitMessage = `${step.name}: ${slug}`;
  await gitExec(infra.spawnFn, cwd, ["commit", "-m", commitMessage]);

  // Push with one retry
  await pushOnly(branch, cwd, step.name, infra);
}

/**
 * Commit final pipeline state (awaiting-archive) to the feature branch.
 *
 * D5: called after the running → awaiting-archive transition in pipeline.ts.
 * Stages all changes (git add -A), commits if there are staged changes
 * (message: "finalize: <slug>"), and pushes with one retry.
 *
 * Idempotent: if no staged changes, returns immediately (no-op).
 * Push failures: warns on stderr but does NOT throw — run is already complete.
 *
 * Uses `spawn.ts` SpawnFn (same as LocalRuntime.spawnFn) so the same injection
 * point works without any adapter.
 */
export async function commitFinalState(params: {
  cwd: string;
  branch: string;
  slug: string;
  spawnFn: PipelineSpawnFn;
}): Promise<void> {
  const { cwd, branch, slug, spawnFn } = params;

  // Stage all changes
  const addResult = await spawnFn("git", ["add", "-A"], { cwd });
  if ((addResult.exitCode ?? 1) !== 0) {
    // Not a git repo or git is non-functional — skip silently
    return;
  }

  // Check for staged changes (exit 1 = changes present, exit 0 = clean)
  const diffResult = await spawnFn("git", ["diff", "--cached", "--quiet"], { cwd });
  if ((diffResult.exitCode ?? 0) !== 1) {
    // No staged changes — nothing to commit
    return;
  }

  // Commit
  const commitResult = await spawnFn("git", ["commit", "-m", `finalize: ${slug}`], { cwd });
  if ((commitResult.exitCode ?? 1) !== 0) {
    stderrWrite(`Warning: finalize commit failed for ${slug}. Push manually to ensure state is on the branch.`);
    return;
  }

  // Push with one retry (best-effort — don't throw on failure)
  const push1 = await spawnFn("git", ["push", "origin", branch], { cwd });
  if ((push1.exitCode ?? 1) === 0) return;

  const push2 = await spawnFn("git", ["push", "origin", branch], { cwd });
  if ((push2.exitCode ?? 1) === 0) return;

  stderrWrite(
    `Warning: failed to push finalize commit for ${slug} to origin/${branch}. ` +
      `Push manually to ensure state is on the branch.`,
  );
}

/**
 * Push to origin with one retry on failure.
 * Emits commit:push event on success.
 * Throws pushFailedError if both attempts fail.
 */
export async function pushOnly(branch: string, cwd: string, stepName: string, infra: CommitPushInfra): Promise<void> {
  const tryPush = () => gitExecExitCode(infra.spawnFn, cwd, ["push", "origin", branch]);

  const firstPushCode = await tryPush();
  if (firstPushCode === 0) {
    infra.events.emit("commit:push", { step: stepName, branch });
    return;
  }

  // Retry after 5 seconds (injectable for testing)
  await infra.sleepFn(5000);
  const secondPushCode = await tryPush();
  if (secondPushCode === 0) {
    infra.events.emit("commit:push", { step: stepName, branch });
    return;
  }

  throw pushFailedError(stepName, branch, `exit code ${secondPushCode}`);
}
