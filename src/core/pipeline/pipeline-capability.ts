/**
 * Pipeline-layer capability interfaces (R2b).
 *
 * Consumer-owned narrow contracts for terminal state commit and round-owned git effects.
 * These interfaces replace the full RuntimeStrategy facade for pipeline-layer consumers
 * (Pipeline, ParallelReviewRound).
 *
 * Design:
 * - Methods are required — capability absence is expressed as `Capability | undefined` at
 *   the injection site (PipelineDeps field), not via optional methods.
 * - RoundEgressParams is a domain-neutral DTO that carries egress ledger parameters for
 *   round commits (replaces the `unknown`-typed egressParams in commitRoundArtifacts).
 * - Derive helpers are defined here per D5 convention.
 */
import type { JobState } from "../../state/schema.js";
import type { ArtifactRef } from "../../state/artifact-types.js";
import type { WorktreeInspectionResult, ChangedFilesResult } from "../port/runtime-strategy.js";
import type { CommitPushInfra } from "../step/commit-push.js";
import type { PushCapability } from "../../git/push-capability.js";

// ---------------------------------------------------------------------------
// RoundEgressParams — domain-neutral DTO for round commit egress params
// ---------------------------------------------------------------------------

/**
 * Domain-neutral DTO for egress ledger parameters passed to commitRoundArtifacts.
 *
 * Replaces the `unknown`-typed egressParams in the former RuntimeStrategy port.
 * All fields are optional / nullable per the existing semantics:
 * - synthesizedCommits: known commit ledger from state (for egress verification).
 * - pushCapability: push restriction capability (Layer 2 backstop, null = no restrictions).
 * - excludeWorktreePatterns: paths excluded from staging (must not trigger backstop).
 */
export interface RoundEgressParams {
  synthesizedCommits: readonly string[];
  pushCapability?: PushCapability | null;
  excludeWorktreePatterns?: string[];
}

// ---------------------------------------------------------------------------
// TerminalStateCapability
// ---------------------------------------------------------------------------

/**
 * Capability for committing and pushing the final pipeline state.
 *
 * Consumed by Pipeline (awaiting-archive / awaiting-resume transitions) and
 * CommandRunner (gate-halt path). Injected via PipelineDeps.terminalState.
 *
 * - local:   git add → commit "finalize/checkpoint: <slug>" → push (best-effort).
 * - managed: no-op.
 *
 * Must NOT throw — push failures are warned on stderr, local resume is preserved.
 */
export interface TerminalStateCapability {
  /**
   * Commit and push the final pipeline state to the feature branch.
   *
   * @param cwd   - Working directory (worktree root). When undefined, the runtime
   *                falls back to its own cwd (e.g. LocalRuntime.cwd). This allows
   *                callers to pass deps.cwd directly without a process.cwd() fallback.
   * @param slug  - Job slug (used in commit message).
   * @param state - Terminal job state (status determines message label).
   */
  commitFinalState(cwd: string | undefined, slug: string, state: JobState): Promise<void>;
}

// ---------------------------------------------------------------------------
// RoundGitEffectsCapability
// ---------------------------------------------------------------------------

/**
 * Capability for coordinator-owned git effects in parallel review rounds.
 *
 * Consumed by ParallelReviewRound. Injected via PipelineDeps.roundGitEffects.
 *
 * All methods are required — capability absence is expressed by roundGitEffects being undefined.
 *
 * - local:   real git operations via worktree.
 * - managed: no-op / unavailable semantics preserved.
 */
export interface RoundGitEffectsCapability {
  /**
   * Capture the current HEAD SHA.
   * Used before/after fan-out for baseline commit detection.
   */
  captureHeadSha(cwd: string): Promise<string | null>;

  /**
   * List files with uncommitted changes in the worktree.
   * Never throws — returns a WorktreeInspectionResult discriminated union.
   * Required — D6: all capability methods are required. Capability absence is expressed
   * by PipelineDeps.roundGitEffects being undefined. LocalRuntime: real implementation.
   * ManagedRuntime: returns { kind: "success", paths: [] } (no-op, no local worktree).
   */
  listWorktreeChanges(cwd: string): Promise<WorktreeInspectionResult>;

  /**
   * Stage only declared paths and commit+push (scoped staging for coordinator rounds).
   * Required — D6: all capability methods are required. Capability absence is expressed
   * by PipelineDeps.roundGitEffects being undefined. LocalRuntime: real implementation.
   * ManagedRuntime: no-op (no local worktree, parallel custom reviewer is Non-Goal).
   *
   * @param stagePaths      - Declared outputs to stage.
   * @param cwd             - Working directory (worktree root).
   * @param branch          - Branch to push to.
   * @param coordinatorName - Coordinator step name (used in commit message).
   * @param slug            - Job slug (used in commit message).
   * @param infra           - Typed commit/push infrastructure.
   * @param egressParams    - Optional egress ledger params (typed DTO, no unknown).
   */
  commitRoundArtifacts(
    stagePaths: string[],
    cwd: string,
    branch: string,
    coordinatorName: string,
    slug: string,
    infra: CommitPushInfra,
    egressParams?: RoundEgressParams,
  ): Promise<void>;

  /**
   * Compute content hashes for artifact paths.
   * Used by the coordinator for canonical doc hash computation.
   * Required — D6: all capability methods are required. Capability absence is expressed
   * by PipelineDeps.roundGitEffects being undefined. LocalRuntime: real implementation.
   * ManagedRuntime: returns all-null hashes (no local filesystem for agent outputs).
   */
  digestArtifacts(
    refs: { path: string }[],
    cwd: string,
    branch: string | null,
  ): Promise<ArtifactRef[]>;

  /**
   * List files changed between a base commit/branch and the current HEAD.
   * Used by per-member invalidation checks.
   */
  listChangedFiles(
    baseBranch: string,
    cwd: string,
    branch: string | null,
  ): Promise<ChangedFilesResult>;
}

// ---------------------------------------------------------------------------
// Derive helpers — bound-method factories for LocalRuntime / ManagedRuntime
// ---------------------------------------------------------------------------

/**
 * Shape required of a runtime to derive TerminalStateCapability.
 */
interface TerminalStateSource {
  commitFinalState(cwd: string | undefined, slug: string, state: JobState): Promise<void>;
}

/**
 * Derive a TerminalStateCapability from a runtime that implements commitFinalState.
 */
export function deriveTerminalStateCapability(
  runtime: TerminalStateSource,
): TerminalStateCapability {
  return {
    commitFinalState: (cwd, slug, state) => runtime.commitFinalState(cwd, slug, state),
  };
}

/**
 * Shape required of a runtime to derive RoundGitEffectsCapability.
 *
 * All methods are required — D6: capability absence is expressed by the runtime returning
 * undefined for roundGitEffects, not by omitting methods from the source shape.
 */
interface RoundGitEffectsSource {
  captureHeadSha(cwd: string): Promise<string | null>;
  listWorktreeChanges(cwd: string): Promise<WorktreeInspectionResult>;
  commitRoundArtifacts(stagePaths: string[], cwd: string, branch: string, coordinatorName: string, slug: string, infra: CommitPushInfra, egressParams?: RoundEgressParams): Promise<void>;
  digestArtifacts(refs: { path: string }[], cwd: string, branch: string | null): Promise<ArtifactRef[]>;
  listChangedFiles(baseBranch: string, cwd: string, branch: string | null): Promise<ChangedFilesResult>;
}

/**
 * Derive a RoundGitEffectsCapability from a runtime that implements the required methods.
 */
export function deriveRoundGitEffectsCapability(
  runtime: RoundGitEffectsSource,
): RoundGitEffectsCapability {
  return {
    captureHeadSha: (cwd) => runtime.captureHeadSha(cwd),
    listWorktreeChanges: (cwd) => runtime.listWorktreeChanges(cwd),
    commitRoundArtifacts: (stagePaths, cwd, branch, coordinatorName, slug, infra, egressParams) =>
      runtime.commitRoundArtifacts(stagePaths, cwd, branch, coordinatorName, slug, infra, egressParams),
    digestArtifacts: (refs, cwd, branch) => runtime.digestArtifacts(refs, cwd, branch),
    listChangedFiles: (baseBranch, cwd, branch) => runtime.listChangedFiles(baseBranch, cwd, branch),
  };
}
