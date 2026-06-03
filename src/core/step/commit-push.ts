import type { AgentStep } from "./types.js";
import type { JobState } from "../../state/schema.js";
import type { PipelineDeps } from "../types.js";
import type { EventBus } from "../event/event-bus.js";
import { gitExec, gitExecExitCode, type SpawnFn } from "../../util/git-exec.js";
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
