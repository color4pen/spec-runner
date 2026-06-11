/**
 * Port DTOs for step output contract verification.
 *
 * Domain-neutral — these types are used by RuntimeStrategy.validateStepOutputs
 * and the output verification seam without pulling in domain specifics.
 *
 * Design: output verification is the symmetric counterpart to the input validation
 * seam (validateStepInputs / RequiredInput). Contracts are declared by steps,
 * checked by the runtime, and enforced by StepExecutor before finalizeStepArtifacts.
 */

/**
 * The kind of output contract:
 * - "produced":        A file declared in writes() must exist, be non-empty, and differ
 *                      from its scaffold template (if one was placed before the step ran).
 * - "tasks-complete":  A tasks.md file must have no unchecked `- [ ]` items.
 */
export type OutputContractKind = "produced" | "tasks-complete";

/**
 * Response policy when a contract violation is detected:
 * - "halt":      Immediately stop the pipeline (STEP_OUTPUT_MISSING).
 *                Used when continuing with a missing output would corrupt later steps
 *                (e.g. empty scaffold committed to the branch).
 * - "follow-up": Send a repair prompt to the same agent session and retry.
 *                Used when the agent can self-correct within the budget (e.g. unchecked tasks).
 */
export type OutputPolicy = "halt" | "follow-up";

/**
 * A single output contract declared by a step.
 * Produced from step.writes() (kind: "produced") or step.outputContracts() (kind: "tasks-complete").
 */
export interface OutputContract {
  /** What kind of contract this is. */
  kind: OutputContractKind;
  /** Worktree-relative path to verify. */
  path: string;
  /** What to do when this contract is violated. */
  policy: OutputPolicy;
  /**
   * Expected scaffold content placed before the step ran (A-group template).
   * When set, file content matching this value is treated as a violation
   * (agent did not overwrite the template).
   * Undefined means no scaffold check is applied.
   */
  scaffold?: string;
}

/**
 * A detected contract violation returned by RuntimeStrategy.validateStepOutputs.
 */
export interface OutputViolation {
  /** Kind of contract that was violated. */
  kind: OutputContractKind;
  /** Worktree-relative path of the violating artifact. */
  path: string;
  /** Policy that applies to this violation. */
  policy: OutputPolicy;
  /**
   * Additional detail:
   * - "produced":       always []
   * - "tasks-complete": list of incomplete task labels extracted from the file
   */
  detail: string[];
}

/**
 * Result of RuntimeStrategy.validateStepOutputs.
 * violations is empty when all contracts are satisfied.
 */
export interface OutputCheckResult {
  violations: OutputViolation[];
}

/**
 * Policy injected into AgentRunContext for output verification follow-up.
 * Constructed by StepExecutor from follow-up-class contracts before runner.run().
 */
export interface OutputVerificationPolicy {
  /**
   * Re-run output validation for follow-up contracts.
   * Bound to (cwd, branch, followUpContracts) by StepExecutor.
   * No-throw — returns OutputCheckResult with violations.
   */
  detect: () => Promise<OutputCheckResult>;
  /** Maximum number of follow-up attempts before giving up. */
  maxAttempts: number;
  /**
   * Build the repair prompt from the current violations and attempt number.
   * Pure function — delegates to buildOutputFollowUpPrompt internally.
   */
  buildPrompt: (violations: OutputViolation[], attempt: number) => string;
}
