/**
 * Step-layer capability interfaces (R2b).
 *
 * Consumer-owned narrow contracts for step artifact lifecycle and step I/O validation.
 * These interfaces replace the full RuntimeStrategy facade for step-layer consumers
 * (StepExecutor, commit-orchestrator, step-completion).
 *
 * Design:
 * - All methods are required — capability absence is expressed as `Capability | undefined` at
 *   the injection site (PipelineDeps field), not via optional methods.
 * - snapshotMainCheckoutGuard is required and uses null return to express runtime unavailability
 *   (no-worktree, managed runtime, or git failure) — not capability absence. This prevents
 *   silent drift-guard omission when a structurally valid capability skips the method.
 * - Derive helpers are defined here (same file as the interface) per D5 convention.
 */
import type { AgentStep } from "./types.js";
import type { JobState } from "../../state/schema.js";
import type { ArtifactRef } from "../../state/artifact-types.js";
import type { RequiredInput, FindingRef, MainCheckoutGuardSnapshot } from "../port/runtime-strategy.js";
import type { OutputContract, OutputCheckResult } from "../port/output-contract.js";
import type { CommitPushInfra } from "./commit-push.js";
import type { SpecRunnerConfig } from "../../config/schema.js";

// ---------------------------------------------------------------------------
// StepArtifactLifecycleCapability
// ---------------------------------------------------------------------------

/**
 * Capability for step artifact prepare/finalize lifecycle.
 *
 * Consumed by StepExecutor and CommitOrchestrator. Injected via PipelineDeps.stepArtifact.
 *
 * - local:   captures HEAD, writes templates, commits after agent run.
 * - managed: all no-ops (no local worktree).
 */
export interface StepArtifactLifecycleCapability {
  /**
   * Capture the current HEAD SHA before an agent step runs.
   */
  captureHeadSha(cwd: string): Promise<string | null>;

  /**
   * Place step output templates in the change folder before the agent runs.
   */
  prepareStepArtifacts(
    cwd: string,
    slug: string,
    stepName: string,
    state: JobState,
  ): Promise<void>;

  /**
   * Clean up B-group reference templates and commit+push after a successful agent run.
   *
   * Called by StepExecutor after the agent session and output gate pass.
   * Parameters are explicitly typed — no `unknown` at the call site.
   *
   * @param step            - The agent step definition.
   * @param state           - Current job state (for branch, slug, synthesizedCommits).
   * @param cwd             - Working directory (worktree root).
   * @param slug            - Job slug.
   * @param headBeforeStep  - HEAD SHA before the step ran (for mixed-reset detection).
   * @param infra           - Typed infrastructure for commit/push.
   */
  finalizeStepArtifacts(
    step: AgentStep,
    state: JobState,
    cwd: string,
    slug: string,
    headBeforeStep: string | null,
    infra: CommitPushInfra,
  ): Promise<void>;

  /**
   * Snapshot guarded main-checkout paths before the agent runs.
   *
   * Required: null return means guard unavailable (no-worktree, managed runtime, or git
   * failure) — not capability absence. Capability absence is expressed by
   * `PipelineDeps.stepArtifact` being undefined. Both production runtimes implement this
   * method; no-op implementations must explicitly return null.
   */
  snapshotMainCheckoutGuard(
    cwd: string,
    config: SpecRunnerConfig,
  ): Promise<MainCheckoutGuardSnapshot | null>;

  /**
   * Compute content hashes for artifact paths (D4, artifact-observability).
   */
  digestArtifacts(
    refs: { path: string }[],
    cwd: string,
    branch: string | null,
  ): Promise<ArtifactRef[]>;
}

// ---------------------------------------------------------------------------
// StepIoValidationCapability
// ---------------------------------------------------------------------------

/**
 * Capability for step I/O validation (pre/post execution contracts).
 *
 * Consumed by StepExecutor (validateStepInputs, validateStepOutputs) and
 * step-completion (verifyFindingRefs). Injected via PipelineDeps.stepIo.
 *
 * All methods are required — capability absence is expressed by stepIo being undefined.
 */
export interface StepIoValidationCapability {
  /**
   * Validate that all required step inputs exist before executing a step.
   * Throws SpecRunnerError("STEP_INPUT_MISSING") if any required input is absent.
   */
  validateStepInputs(
    inputs: RequiredInput[],
    cwd: string,
    branch: string | null,
  ): Promise<void>;

  /**
   * Validate declared step output contracts after the agent session completes.
   * Never throws — returns OutputCheckResult with violations.
   */
  validateStepOutputs(
    contracts: OutputContract[],
    cwd: string,
    branch: string | null,
    excludeWorktreePatterns?: string[],
  ): Promise<OutputCheckResult>;

  /**
   * Verify that finding references (file + optional line) actually exist.
   * Returns the subset of refs that do NOT exist.
   */
  verifyFindingRefs(
    refs: FindingRef[],
    cwd: string,
    branch: string | null,
  ): Promise<FindingRef[]>;
}

// ---------------------------------------------------------------------------
// Derive helpers — bound-method factories for LocalRuntime / ManagedRuntime
// ---------------------------------------------------------------------------

/**
 * Shape required of a runtime to derive StepArtifactLifecycleCapability.
 */
interface StepArtifactSource {
  captureHeadSha(cwd: string): Promise<string | null>;
  prepareStepArtifacts(cwd: string, slug: string, stepName: string, state: JobState): Promise<void>;
  finalizeStepArtifacts(step: AgentStep, state: JobState, cwd: string, slug: string, headBeforeStep: string | null, infra: CommitPushInfra): Promise<void>;
  snapshotMainCheckoutGuard(cwd: string, config: SpecRunnerConfig): Promise<MainCheckoutGuardSnapshot | null>;
  digestArtifacts(refs: { path: string }[], cwd: string, branch: string | null): Promise<ArtifactRef[]>;
}

/**
 * Derive a StepArtifactLifecycleCapability from a runtime that implements the required methods.
 *
 * Per D5: defined in the same file as the capability interface.
 * Bind-style helper: wraps each method so the runtime's `this` context is preserved.
 */
export function deriveStepArtifactLifecycleCapability(
  runtime: StepArtifactSource,
): StepArtifactLifecycleCapability {
  return {
    captureHeadSha: (cwd) => runtime.captureHeadSha(cwd),
    prepareStepArtifacts: (cwd, slug, stepName, state) =>
      runtime.prepareStepArtifacts(cwd, slug, stepName, state),
    finalizeStepArtifacts: (step, state, cwd, slug, head, infra) =>
      runtime.finalizeStepArtifacts(step, state, cwd, slug, head, infra),
    snapshotMainCheckoutGuard: (cwd, config) => runtime.snapshotMainCheckoutGuard(cwd, config),
    digestArtifacts: (refs, cwd, branch) => runtime.digestArtifacts(refs, cwd, branch),
  };
}

/**
 * Shape required of a runtime to derive StepIoValidationCapability.
 */
interface StepIoSource {
  validateStepInputs(inputs: RequiredInput[], cwd: string, branch: string | null): Promise<void>;
  validateStepOutputs(contracts: OutputContract[], cwd: string, branch: string | null, excludeWorktreePatterns?: string[]): Promise<OutputCheckResult>;
  verifyFindingRefs(refs: FindingRef[], cwd: string, branch: string | null): Promise<FindingRef[]>;
}

/**
 * Derive a StepIoValidationCapability from a runtime that implements the required methods.
 */
export function deriveStepIoValidationCapability(
  runtime: StepIoSource,
): StepIoValidationCapability {
  return {
    validateStepInputs: (inputs, cwd, branch) => runtime.validateStepInputs(inputs, cwd, branch),
    validateStepOutputs: (contracts, cwd, branch, excludeWorktreePatterns) =>
      runtime.validateStepOutputs(contracts, cwd, branch, excludeWorktreePatterns),
    verifyFindingRefs: (refs, cwd, branch) => runtime.verifyFindingRefs(refs, cwd, branch),
  };
}
