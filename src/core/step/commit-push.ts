import type { AgentStep } from "./types.js";
import type { JobState } from "../../state/schema.js";
import type { PipelineDeps } from "../types.js";
import type { EventBus } from "../event/event-bus.js";
import { gitExec, gitExecExitCode, type SpawnFn } from "../../util/git-exec.js";
import { stderrWrite } from "../../logger/stdout.js";
import { noCommitDetectedError, pushFailedError, authoritySpecEditViolationError } from "../../errors.js";

/** Prefix that identifies authority spec files. Delta specs under specrunner/changes/ are NOT violations. */
const AUTHORITY_SPEC_PREFIX = "specrunner/specs/";

/** Return paths that start with the authority spec prefix. */
export function findAuthoritySpecViolations(filePaths: string[]): string[] {
  return filePaths.filter(p => p.startsWith(AUTHORITY_SPEC_PREFIX));
}

/** Infrastructure deps for commit/push operations. */
export interface CommitPushInfra {
  spawnFn: SpawnFn;
  sleepFn: (ms: number) => Promise<void>;
  events: EventBus;
}

/**
 * Stage all changes, commit, and push to origin.
 *
 * Extended with HEAD comparison for agent self-commit tolerance:
 * - git add -A
 * - git diff --cached --quiet (exit 0 = no changes)
 * - if no changes and requiresCommit:
 *   - compare headBeforeStep with current HEAD
 *   - if HEAD advanced (agent self-committed): push only, log detection message
 *   - otherwise: throw noCommitDetectedError
 * - if no changes and !requiresCommit: return silently
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

  // Stage all changes. If git add fails (not a git repo, exit 128, etc.), handle gracefully.
  const addExitCode = await gitExecExitCode(infra.spawnFn, cwd, ["add", "-A"]);
  if (addExitCode !== 0) {
    // git is non-functional in this directory (e.g., not a git repo).
    if (step.requiresCommit) {
      throw noCommitDetectedError(step.name, branch);
    }
    return;
  }

  // Check if there are staged changes.
  // `git diff --cached --quiet` exits 0 when no staged changes, 1 when there are staged changes.
  const diffExitCode = await gitExecExitCode(infra.spawnFn, cwd, ["diff", "--cached", "--quiet"]);
  const hasChanges = diffExitCode === 1;

  if (!hasChanges) {
    if (step.requiresCommit) {
      // Check if HEAD advanced (agent self-committed before pipeline commit).
      const headAfterStep = await gitExec(infra.spawnFn, cwd, ["rev-parse", "HEAD"]);
      if (headBeforeStep && headAfterStep && headAfterStep !== headBeforeStep) {
        // Agent self-commit path: inspect HEAD diff for authority spec violations before pushing.
        const headDiffOutput = await gitExec(infra.spawnFn, cwd, ["diff", `${headBeforeStep}..${headAfterStep}`, "--name-only"]);
        if (headDiffOutput) {
          const headFilePaths = headDiffOutput.split("\n").filter(p => p.length > 0);
          const headViolations = findAuthoritySpecViolations(headFilePaths);
          if (headViolations.length > 0) {
            throw authoritySpecEditViolationError(step.name, headViolations);
          }
        }
        // Agent authored commit(s) since step start — push the existing commits as-is.
        stderrWrite("Detected agent-authored commit(s) since step start; skipping pipeline commit and pushing as-is.\n");
        await pushOnly(branch, cwd, step.name, infra);
        return;
      }
      throw noCommitDetectedError(step.name, branch);
    }
    // No changes and requiresCommit is falsy — silently skip
    return;
  }

  // Staged changes exist — check for authority spec violations before committing.
  const stagedFilesOutput = await gitExec(infra.spawnFn, cwd, ["diff", "--cached", "--name-only"]);
  if (stagedFilesOutput) {
    const stagedFilePaths = stagedFilesOutput.split("\n").filter(p => p.length > 0);
    const stagedViolations = findAuthoritySpecViolations(stagedFilePaths);
    if (stagedViolations.length > 0) {
      throw authoritySpecEditViolationError(step.name, stagedViolations);
    }
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
