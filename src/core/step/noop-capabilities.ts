/**
 * No-op capability singletons for testing (R2b).
 *
 * Provides inert implementations of all four production-required capability interfaces.
 * Consumed by test helpers that construct PipelineDeps without needing git/IO behavior.
 *
 * Design:
 * - All methods are no-ops that return the "empty / absent" value for each method.
 * - These singletons satisfy the non-nullable PipelineDeps field types, preventing
 *   silent capability-omission bugs that would be masked by `| undefined` fields.
 * - captureHeadSha returns null (no local git in test context).
 * - validateStepOutputs returns { violations: [] } (no contracts violated).
 * - verifyFindingRefs returns [] (no invalid refs).
 * - listWorktreeChanges returns { kind: "success", paths: [] } (no changes).
 * - listChangedFiles returns { kind: "success", files: [] } (no changed files).
 */

import type { StepArtifactLifecycleCapability, StepIoValidationCapability } from "./step-capability.js";
import type { TerminalStateCapability, RoundGitEffectsCapability } from "../pipeline/pipeline-capability.js";

// ---------------------------------------------------------------------------
// noopStepArtifact
// ---------------------------------------------------------------------------

/**
 * No-op StepArtifactLifecycleCapability for tests.
 *
 * - captureHeadSha: returns null (no git HEAD in test context).
 * - prepareStepArtifacts: no-op (no worktree templates to write).
 * - finalizeStepArtifacts: no-op (no git commit/push).
 * - snapshotMainCheckoutGuard: returns null (no local worktree in test context).
 * - digestArtifacts: returns all-null hashes (no worktree content).
 */
export const noopStepArtifact: StepArtifactLifecycleCapability = {
  captureHeadSha: async () => null,
  prepareStepArtifacts: async () => {},
  finalizeStepArtifacts: async () => {},
  snapshotMainCheckoutGuard: async () => null,
  digestArtifacts: async (refs) => refs.map((r) => ({ path: r.path, hash: null })),
};

// ---------------------------------------------------------------------------
// noopStepIo
// ---------------------------------------------------------------------------

/**
 * No-op StepIoValidationCapability for tests.
 *
 * - validateStepInputs: no-op (no input validation).
 * - validateStepOutputs: returns no violations.
 * - verifyFindingRefs: returns empty list (no invalid refs).
 */
export const noopStepIo: StepIoValidationCapability = {
  validateStepInputs: async () => {},
  validateStepOutputs: async () => ({ violations: [] }),
  verifyFindingRefs: async () => [],
};

// ---------------------------------------------------------------------------
// noopTerminalState
// ---------------------------------------------------------------------------

/**
 * No-op TerminalStateCapability for tests.
 *
 * - commitFinalState: no-op (no git commit/push for terminal state).
 */
export const noopTerminalState: TerminalStateCapability = {
  commitFinalState: async () => {},
};

// ---------------------------------------------------------------------------
// noopRoundGitEffects
// ---------------------------------------------------------------------------

/**
 * No-op RoundGitEffectsCapability for tests.
 *
 * - captureHeadSha: returns null (no git HEAD).
 * - listWorktreeChanges: returns empty success (no changes).
 * - commitRoundArtifacts: no-op (no git commit).
 * - digestArtifacts: returns all-null hashes.
 * - listChangedFiles: returns empty success (no changed files).
 */
export const noopRoundGitEffects: RoundGitEffectsCapability = {
  captureHeadSha: async () => null,
  listWorktreeChanges: async () => ({ kind: "success", paths: [] }),
  commitRoundArtifacts: async () => {},
  digestArtifacts: async (refs) => refs.map((r) => ({ path: r.path, hash: null })),
  listChangedFiles: async () => ({ kind: "success", files: [] }),
};
