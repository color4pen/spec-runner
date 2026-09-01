import type { SessionClient } from "./port/session-client.js";
import type { GitHubClient } from "./port/github-client.js";
import type { AgentRunner } from "./port/agent-runner.js";
import type { SpawnFn } from "../util/spawn.js";
import type { SpawnFn as GitExecSpawnFn } from "../util/git-exec.js";
import type { JobStateStore } from "../store/job-state-store.js";
import type { ResumeContextSnapshot } from "./resume/resume-context.js";
import type { ChangedFilesCapability, CommitInspectionCapability, RevisionContentCapability, WorkspaceContext } from "./port/runtime-strategy.js";
import type { SpecRunnerConfig } from "../config/schema.js";
import type { ParsedRequest } from "../parser/request-md.js";
import type { StepArtifactLifecycleCapability, StepIoValidationCapability } from "./step/step-capability.js";
import type { TerminalStateCapability, RoundGitEffectsCapability } from "./pipeline/pipeline-capability.js";

export type { StepContext } from "./port/step-context.js";
import type { StepContext } from "./port/step-context.js";

/**
 * Factory function that creates a JobStateStore for the given job ID.
 * Injected via PipelineDeps to eliminate inline `new JobStateStore()` calls.
 * Exported so that cancel/finish/resume can adopt the same seam in future requests.
 */
export type StoreFactory = (jobId: string) => JobStateStore;

/**
 * Dependencies injected into all pipeline steps.
 * Defined here (not in pipeline.ts) to break potential circular imports
 * between pipeline.ts ↔ loop.ts ↔ steps/*.ts.
 *
 * Extends StepContext so that PipelineDeps can be passed anywhere StepContext is expected.
 * Design D1 (stepcontext-type-separation): PipelineDeps extends StepContext.
 *
 * R2b: runtimeStrategy is removed. Consumers use narrow capability fields instead.
 * Capability absence is expressed by the field being undefined (not optional methods).
 */
export interface PipelineDeps extends StepContext {
  /**
   * Managed-agent session client. Required for "managed" runtime.
   * Optional when runtime === "local" (ClaudeCodeRunner does not need it).
   * Design D8: composition root injects the appropriate AgentRunner based on runtime config.
   * Note: client is maintained for backward compatibility; after runner is added,
   * pipeline steps use runner directly. client will be removed in a future cleanup request.
   */
  client?: SessionClient;
  /** Injectable sleep for testing */
  sleepFn?: (ms: number) => Promise<void>;
  /** GitHub client (port interface). Required for all pipeline steps. */
  githubClient: GitHubClient;
  /** GitHub repository owner. Required for PR operations. */
  owner: string;
  /** GitHub repository name. Required for PR operations. */
  repo: string;
  /**
   * Pre-built AgentRunner injected by RuntimeStrategy.buildDeps().
   * createStandardPipeline and runProposePipeline use this directly,
   * eliminating the config.runtime branch in pipeline/run.ts.
   * Design D8: runner replaces runtime-specific AgentRunner construction in pipeline.
   */
  runner?: AgentRunner;
  /**
   * Subprocess spawning function. Injected by RuntimeStrategy.buildDeps().
   * CLI steps (verification, pr-create) pass this to subprocess-spawning functions.
   * Design D3 (require-spawn-injection): required to prevent leaky defaults in tests.
   */
  spawn: SpawnFn;
  /**
   * Factory for creating JobStateStore instances. Injected by RuntimeStrategy.buildDeps().
   * Pipeline and executor use this instead of inline `new JobStateStore()`.
   * Design D1 (job-state-store-di): required to prevent leaky defaults in tests.
   */
  storeFactory: StoreFactory;
  /**
   * resume 時にユーザーが注入した追加プロンプト。
   * StepExecutor が最初の agent ステップで消費し undefined にする。
   */
  resumePrompt?: string;
  /**
   * Snapshot captured before resume preparation clears state.resumePoint.
   * StepExecutor uses it to deterministically build automatic resume context.
   */
  resumeContext?: ResumeContextSnapshot;
  /**
   * Absolute path to the git repository root.
   * Used by StepExecutor to compute agent session log paths (debug level).
   * Optional for backward compatibility with existing tests.
   */
  repoRoot?: string;
  /**
   * git-exec.ts SpawnFn wrapped with transport auth (extraheader injection).
   * Injected by LocalRuntime.buildDeps() for StepExecutor commit/push operations.
   * Optional for backward compatibility with existing tests that don't inject it.
   */
  gitTransportSpawn?: GitExecSpawnFn;
  /**
   * Step artifact lifecycle capability (R2b).
   * Injected by buildDeps(). Handles captureHeadSha, prepareStepArtifacts,
   * finalizeStepArtifacts, snapshotMainCheckoutGuard, digestArtifacts.
   * Required non-nullable field — both LocalRuntime and ManagedRuntime always inject a
   * real implementation. ManagedRuntime injects no-op implementations (no local worktree).
   * Tests must inject noopStepArtifact (src/core/step/noop-capabilities.ts) or a custom stub.
   */
  stepArtifact: StepArtifactLifecycleCapability;
  /**
   * Step I/O validation capability (R2b).
   * Injected by buildDeps(). Handles validateStepInputs, validateStepOutputs,
   * verifyFindingRefs.
   * Required non-nullable field — both LocalRuntime and ManagedRuntime always inject a
   * real implementation.
   * Tests must inject noopStepIo (src/core/step/noop-capabilities.ts) or a custom stub.
   */
  stepIo: StepIoValidationCapability;
  /**
   * Terminal state capability (R2b).
   * Injected by buildDeps(). Handles commitFinalState for pipeline/command terminal transitions.
   * Required non-nullable field — both LocalRuntime and ManagedRuntime always inject a
   * real implementation. ManagedRuntime injects a no-op implementation.
   * Tests must inject noopTerminalState (src/core/step/noop-capabilities.ts) or a custom stub.
   */
  terminalState: TerminalStateCapability;
  /**
   * Round-owned git effects capability (R2b).
   * Injected by buildDeps(). Handles coordinator fan-out git operations:
   * captureHeadSha, listWorktreeChanges, commitRoundArtifacts, digestArtifacts, listChangedFiles.
   * Required non-nullable field — both LocalRuntime and ManagedRuntime always inject a
   * real implementation. ManagedRuntime injects no-op implementations (no local worktree).
   * Tests must inject noopRoundGitEffects (src/core/step/noop-capabilities.ts) or a custom stub.
   */
  roundGitEffects: RoundGitEffectsCapability;
  /**
   * Changed-files derivation capability (R2a).
   * Injected by buildDeps(). Handles listChangedFiles and canDeriveChangedFiles.
   * Optional: undefined when runtime does not support changed-file derivation.
   */
  changedFiles?: ChangedFilesCapability;
  /**
   * Commit inspection capability (R2a).
   * Injected by buildDeps(). Handles listCommitChangedFiles.
   * Optional: undefined when runtime cannot inspect commits (e.g. managed runtime).
   */
  commitInspection?: CommitInspectionCapability;
  /**
   * Revision content capability (R2a).
   * Injected by buildDeps(). Handles readRevisionContent.
   * Optional: undefined when runtime cannot read revision content (e.g. managed runtime).
   */
  revisionContent?: RevisionContentCapability;
  /**
   * When true, this execution input is owned by a coordinator round.
   * The executor skips finalizeStepArtifacts (git stage/commit/push) entirely;
   * the coordinator is responsible for the round's git side effects via
   * commitRoundArtifacts after all members complete.
   *
   * Absent / false = sequential path: finalizeStepArtifacts runs as before.
   *
   * D3 (round-owned-git-effects): round ownership flag for the executor gate.
   */
  roundOwnsGitEffects?: boolean;
}

/**
 * Domain-owned contract for assembling PipelineDeps from a resolved workspace.
 *
 * T-18: Moved off RuntimeStrategy (ports layer) onto the domain layer so that
 * runtime-strategy.ts no longer needs to import from types.ts (DSM §3 closure).
 * Concrete runtimes (LocalRuntime, ManagedRuntime) implement this alongside
 * RuntimeStrategy. Composition-root types (CommandRunner, factory.ts) use the
 * intersection RuntimeStrategy & PipelineDepsBuilder.
 */
export interface PipelineDepsBuilder {
  /**
   * Assemble PipelineDeps for the resolved workspace.
   * Called by CommandRunner.execute() after setupWorkspace() succeeds.
   */
  buildDeps(
    config: SpecRunnerConfig,
    request: ParsedRequest,
    slug: string,
    workspace: WorkspaceContext,
  ): PipelineDeps;
}

// ---------------------------------------------------------------------------
// T-19: Consumer-owned composite deps types live in their consumer modules
// (operator review, PR #1105 — no Pick/Omit derivation from PipelineDeps):
//   - StepExecutionDeps        → src/core/step/step-deps.ts
//   - ParallelReviewRoundDeps  → src/core/pipeline/parallel-review-round.ts
//   - PipelineOrchestrationDeps→ src/core/pipeline/pipeline.ts
// PipelineDeps must remain structurally assignable to each of them without
// casts (enforced at the existing hand-off call sites by the compiler).
// ---------------------------------------------------------------------------
