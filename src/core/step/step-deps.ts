/**
 * StepExecutionDeps — consumer-owned deps contract for StepExecutor and its
 * step-layer collaborators (buildStepContext, step-completion.ts,
 * commit-orchestrator.ts).
 *
 * T-19 (operator review, PR #1105): declared here in the step layer as an
 * explicit interface. It is NOT derived from PipelineDeps via Pick/Omit —
 * the consumer owns this contract; the producer aggregate (PipelineDeps)
 * merely satisfies it structurally, without casts, at the Pipeline →
 * StepExecutor hand-off. Adding a field is an explicit, reviewable act here.
 *
 * Deliberately excluded: terminalState (Pipeline-level), roundGitEffects
 * (round-level), client (composition-root session handle), runner
 * (composition-root agent runner).
 */

import type { StepContext } from "../port/step-context.js";
import type { GitHubClient } from "../port/github-client.js";
import type { SpawnFn } from "../../util/spawn.js";
import type { SpawnFn as GitExecSpawnFn } from "../../util/git-exec.js";
import type { ResumeContextSnapshot } from "../resume/resume-context.js";
import type { StoreFactory } from "../types.js";
import type { StepArtifactLifecycleCapability, StepIoValidationCapability } from "./step-capability.js";
import type {
  ChangedFilesCapability,
  CommitInspectionCapability,
  RevisionContentCapability,
} from "../port/runtime-strategy.js";

export interface StepExecutionDeps extends StepContext {
  /** GitHub client (port interface). Required for all pipeline steps. */
  githubClient: GitHubClient;
  /** GitHub repository owner. Required for PR operations. */
  owner: string;
  /** GitHub repository name. Required for PR operations. */
  repo: string;
  /** Subprocess spawning function. CLI steps pass this to subprocess-spawning functions. */
  spawn: SpawnFn;
  /** Factory for creating JobStateStore instances (no inline `new JobStateStore()`). */
  storeFactory: StoreFactory;
  /**
   * Step artifact lifecycle capability (R2b). Required non-nullable —
   * absence of a local worktree is expressed by injecting a no-op
   * implementation (src/core/step/noop-capabilities.ts), not by omitting the field.
   */
  stepArtifact: StepArtifactLifecycleCapability;
  /** Step I/O validation capability (R2b). Required non-nullable. */
  stepIo: StepIoValidationCapability;
  /** Changed-files derivation capability (R2a). undefined = runtime cannot derive changed files. */
  changedFiles?: ChangedFilesCapability;
  /** Commit inspection capability (R2a). undefined = runtime cannot inspect commits. */
  commitInspection?: CommitInspectionCapability;
  /** Revision content capability (R2a). undefined = runtime cannot read revision content. */
  revisionContent?: RevisionContentCapability;
  /**
   * When true, this execution input is owned by a coordinator round: the
   * executor skips finalizeStepArtifacts entirely (D3 round-owned-git-effects).
   */
  roundOwnsGitEffects?: boolean;
  /** git-exec.ts SpawnFn wrapped with transport auth, for commit/push operations. */
  gitTransportSpawn?: GitExecSpawnFn;
  /** Injectable sleep for testing. */
  sleepFn?: (ms: number) => Promise<void>;
  /**
   * resume 時にユーザーが注入した追加プロンプト。
   * StepExecutor が最初の agent ステップで消費し undefined にする。
   */
  resumePrompt?: string;
  /** Snapshot captured before resume preparation clears state.resumePoint. */
  resumeContext?: ResumeContextSnapshot;
  /** Absolute path to the git repository root (agent session log paths). */
  repoRoot?: string;
}
