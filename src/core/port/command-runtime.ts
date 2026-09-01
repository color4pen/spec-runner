/**
 * Command lifecycle capability interfaces.
 *
 * R2c: Command-layer contracts that replace the whole-port RuntimeStrategy & PipelineDepsBuilder
 * dependency in CommandRunner, PipelineRunCommand, and ResumeCommand.
 *
 * Design D1: 4 named lifecycle capability interfaces + RuntimeFacade intersection.
 * - ProviderReadinessCapability: pre-side-effect provider readiness check
 * - JobBootstrapCapability: duplicate guard + job bootstrap
 * - WorkspaceLifecycleCapability: workspace setup / cleanup registration / teardown
 * - JobStatePersistenceCapability: persist + reload job state
 *
 * RuntimeFacade is the intersection type for composition-root consumers (factory.ts,
 * bootstrap.ts, PipelineRunCommand, ResumeCommand). LocalRuntime and ManagedRuntime
 * satisfy RuntimeFacade structurally via TypeScript structural subtyping.
 */
import type { JobState, RequestInfo, RepositoryInfo } from "../../state/schema.js";
import type { WorkspaceOptions, WorkspaceContext, CleanupHandle, ChangedFilesCapability } from "./runtime-strategy.js";
import type { PipelineDepsBuilder } from "../types.js";

// ---------------------------------------------------------------------------
// ProviderReadinessCapability
// ---------------------------------------------------------------------------

/**
 * Capability: assert provider readiness before any side effects.
 *
 * Must be called before prepare() side effects so that a readiness failure
 * surfaces prior to any persistent mutations (job record / worktree / branch / journal).
 *
 * - local:   calls the injected ProviderReadinessProbe; throws PROVIDER_NOT_READY on failure.
 * - managed: no-op (managed readiness is handled by preflight / session creation).
 */
export interface ProviderReadinessCapability {
  assertProviderReadiness(env: Record<string, string | undefined>): Promise<void>;
}

// ---------------------------------------------------------------------------
// JobBootstrapCapability
// ---------------------------------------------------------------------------

/**
 * Capability: duplicate-live-job guard + job state bootstrap.
 *
 * assertNoDuplicateLiveJob must be called before bootstrapJob so a rejected run
 * creates no job state. Both methods are required.
 *
 * - local:   assertNoDuplicateLiveJob scans slug occupancy (throws SLUG_OCCUPIED on conflict).
 *            bootstrapJob creates in-memory JobState; persistence deferred to setupWorkspace.
 * - managed: assertNoDuplicateLiveJob is no-op. bootstrapJob creates in-memory JobState.
 */
export interface JobBootstrapCapability {
  assertNoDuplicateLiveJob(repoRoot: string, slug: string): Promise<void>;
  bootstrapJob(
    repoRoot: string,
    params: { request: RequestInfo; repository: RepositoryInfo; pipelineId?: string },
  ): Promise<JobState>;
}

// ---------------------------------------------------------------------------
// WorkspaceLifecycleCapability
// ---------------------------------------------------------------------------

/**
 * Capability: workspace setup, cleanup registration, and teardown.
 *
 * Execution order enforced by CommandRunner.execute():
 *   1. setupWorkspace   — prepare workspace directory
 *   2. registerCleanup  — register signal/failure handlers
 *   3. ... pipeline runs ...
 *   4. teardown         — deregister handlers and clean up on failure
 *
 * - local:   setupWorkspace creates a git worktree; registerCleanup sets SIGINT/SIGTERM handlers;
 *            teardown deregisters handlers and removes the worktree on failure.
 * - managed: setupWorkspace returns { cwd } unchanged; registerCleanup and teardown are no-ops.
 */
export interface WorkspaceLifecycleCapability {
  setupWorkspace(
    slug: string,
    jobId: string,
    opts?: WorkspaceOptions,
  ): Promise<WorkspaceContext>;
  registerCleanup(jobId: string, startStep: string): CleanupHandle;
  teardown(handle: CleanupHandle, finalStatus: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// JobStatePersistenceCapability
// ---------------------------------------------------------------------------

/**
 * Capability: persist and reload job state from the canonical store.
 *
 * - persistJobState: write terminal or transitional state to the slug store.
 * - reloadJobState:  reload state after setupWorkspace() so all fields written
 *   by setupWorkspace (worktreePath, synthesizedCommits, branch, etc.) are
 *   reflected in the in-memory state passed to the pipeline.
 *
 * Skip conditions for reloadJobState (enforced by CommandRunner.execute()):
 *   - resume path: skip when workspaceOpts.existingWorktreePath !== undefined.
 *
 * Behavior by runtime:
 * - local:   reloadJobState reads from the slug store (worktreePath-based stateRoot).
 * - managed: reloadJobState throws — managed runtime does not support store reload in
 *            new-run path. If called (existingWorktreePath === undefined), RELOAD_FAILED.
 */
export interface JobStatePersistenceCapability {
  persistJobState(
    jobId: string,
    slug: string,
    workspace: WorkspaceContext | null,
    state: JobState,
  ): Promise<void>;
  reloadJobState(
    jobId: string,
    slug: string,
    workspace: WorkspaceContext,
  ): Promise<JobState>;
}

// ---------------------------------------------------------------------------
// RuntimeFacade
// ---------------------------------------------------------------------------

/**
 * Composition-root type for CommandRunner and its subclasses.
 *
 * Replaces `RuntimeStrategy & PipelineDepsBuilder` as the type for factory.ts,
 * bootstrap.ts, PipelineRunCommand, and ResumeCommand. Each component is a
 * named required capability interface, making the lifecycle contract explicit.
 *
 * `ChangedFilesCapability` is included because PipelineRunCommand.prepare() calls
 * assertRuntimeSupportsScope() which requires canDeriveChangedFiles() before any
 * workspace or job state is created.
 *
 * LocalRuntime and ManagedRuntime satisfy RuntimeFacade structurally.
 * Contract compliance is verified at compile time in command-lifecycle-contract.test.ts.
 */
export type RuntimeFacade =
  ProviderReadinessCapability &
  JobBootstrapCapability &
  WorkspaceLifecycleCapability &
  JobStatePersistenceCapability &
  PipelineDepsBuilder &
  ChangedFilesCapability;
