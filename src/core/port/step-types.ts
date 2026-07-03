import type { JobState } from "../../state/schema.js";
import type { StepContext } from "./step-context.js";
import type { SpawnFn } from "../../util/spawn.js";
import type { CustomToolHandler } from "../../kernel/tool-types.js";
import type { AgentDefinition } from "../../kernel/agent-definition.js";
import type { DynamicContext } from "../../git/dynamic-context.js";
import type { ReportToolSpec, BaseReportResult } from "./report-result.js";
import type { ReviewerActivation } from "../../kernel/reviewer-snapshot.js";
import type { OutputContract } from "./output-contract.js";

// Re-export AgentDefinition for convenience
export type { AgentDefinition };

/**
 * A resolved I/O reference for a step's reads/writes declaration.
 * path is worktree-relative (resolved from util/paths; {n} substituted from state).
 *
 * D1 (step-io-contracts): steps declare their I/O via reads/writes pure methods.
 */
export interface IoRef {
  /** Worktree-relative path resolved from util/paths (no {n} placeholders). */
  path: string;
  /**
   * Whether this input is required (reads only; ignored for writes).
   * Default: true. false = optional input; absence does not halt the step.
   */
  required?: boolean;
  /**
   * Artifact type for pre-execution validation.
   * Default: "file". "gitState" = git state (branch/worktree) rather than a file.
   */
  artifact?: "file" | "gitState";
  /**
   * Whether to include this write in the produced output contracts (writes only).
   * Default: true. false = exclude from post-execution verification.
   *
   * Use false when the write is conditional on runtime state (e.g. only written
   * for certain request types) and absence in the normal pipeline path is expected.
   *
   * D3 (step-completion-verification): output contract opt-out.
   */
  verify?: boolean;
}

/**
 * Dependencies injected into Step methods (buildMessage, resultFilePath, parseResult).
 * Aliased to StepContext — the minimal set of fields Step implementations actually need.
 *
 * Design D2 (stepcontext-type-separation): StepDeps = StepContext (was PipelineDeps).
 * Callers that pass PipelineDeps remain valid because PipelineDeps extends StepContext.
 */
export type StepDeps = StepContext;

/**
 * Dependencies for CLI-resident steps (kind: "cli").
 * Extends StepDeps with spawn — required for steps that invoke subprocesses.
 * Agent steps continue to use StepDeps (no spawn needed).
 *
 * Design D2 (require-spawn-injection): compile-time guarantee that CLI steps
 * receive an injected spawn function rather than falling back to a default.
 */
export interface CliStepDeps extends StepDeps {
  spawn: SpawnFn;
}

/**
 * The outcome of a successful step execution, as returned by parseResult.
 * Used by StepExecutor to record the StepRun.
 */
export interface ParsedStepResult {
  verdict: import("../../state/schema.js").Verdict | null;
  findingsPath: string | null;
  /**
   * PR info extracted by PrCreateStep. Other steps leave this undefined.
   * StepExecutor.finalizeStep() reflects this into state.pullRequest when present.
   */
  pullRequest?: { url: string; number: number; createdAt: string };
}

/**
 * NULL_PARSE_RESULT: shared constant for steps that have no file-based verdict.
 * Used by propose, spec-fixer, implementer, and build-fixer.
 */
export const NULL_PARSE_RESULT: ParsedStepResult = {
  verdict: null,
  findingsPath: null,
};

/**
 * AgentStep: a pipeline step that uses a managed Anthropic agent session.
 * kind: "agent" — StepExecutor creates and polls a session.
 */
export interface AgentStep {
  kind: "agent";
  /** Canonical name of this step (e.g. "design", "spec-review"). Must match agent.role. */
  name: string;
  /** Full agent definition used by this step. Owned by the Step implementation. */
  agent: AgentDefinition;
  /**
   * Custom tool handlers scoped to this step.
   * Key = tool name (e.g. "register_branch"), Value = handler function.
   * Optional — steps that have no custom tools omit this field.
   */
  toolHandlers?: Map<string, CustomToolHandler>;
  /**
   * Build the initial user message content for this step.
   * Pure function — no I/O allowed.
   */
  buildMessage(state: JobState, deps: StepDeps): string;
  /**
   * Compute the path of the result file written by the agent for this step.
   * Returns null if no result file is expected.
   */
  resultFilePath(state: JobState, deps: StepDeps): string | null;
  /**
   * Parse the result file content into a step outcome.
   * Pure function — no I/O allowed.
   */
  parseResult(content: string, deps: StepDeps): ParsedStepResult;

  /**
   * Verdict to record when resultFilePath is null and the session completes successfully.
   * Defaults to "approved" if omitted (preserves spec-fixer → spec-review loop behavior).
   * Set to "success" for agent steps where completion = unconditional forward progress
   * (e.g. implementer, build-fixer).
   */
  completionVerdict?: import("../../state/schema.js").Verdict;

  /**
   * Maximum number of turns for the SDK query() call.
   * When set, ClaudeCodeRunner passes this value as options.maxTurns to the SDK.
   * When absent, the default of 30 is used.
   * Design D3 (propose-openspec-cli-and-step-model-config): per-step maxTurns configuration.
   */
  maxTurns?: number;

  /**
   * Compute maxTurns dynamically based on runtime state.
   * When defined and returns a number, this value is used as the step-level
   * default (priority 3 in the resolution chain) instead of step.maxTurns.
   * When undefined or returns undefined, step.maxTurns is used as fallback.
   */
  getMaxTurns?(state: JobState): number | undefined;

  /**
   * 動的に followUpPrompt を解決する。定義時は静的 followUpPrompt より優先される。
   * undefined を返すと follow turn は実行されない。
   */
  getFollowUpPrompt?(state: JobState, deps: StepDeps): string | undefined;

  /**
   * If true, StepExecutor sets state.branch after this step completes (local runtime path only).
   * Used for steps that create the feature branch as a side effect of their execution
   * (e.g., propose). The branch is set to `feat/${slug}` if state.branch is not already set.
   *
   * This flag replaces any step-name-based branch detection logic, enabling declarative
   * branch setup without hardcoding step names in executor.ts (TC-006 / TC-003).
   *
   * Only applies when state.branch is absent at the time of step completion.
   * If state.branch is already set, this flag has no effect.
   */
  setsBranch?: boolean;

  /**
   * If true, StepExecutor reads project.md from the working directory and
   * injects it as projectContext into AgentRunContext before calling runner.run().
   * Replaces the PROJECT_CONTEXT_STEPS Set in executor.ts.
   */
  needsProjectContext?: boolean;

  /**
   * 作業 turn 完了後に同一 session で投げる follow プロンプト。
   * 未指定の step は従来通り作業 turn のみで実行される。
   * 汎用 field: 任意の AgentStep が primitive 改修なしで設定可能。
   */
  followUpPrompt?: string;

  /**
   * report_result tool specification for this step.
   * When set, the adapter registers the tool and detects its invocation.
   * All 10 agent steps define this in phase 1 using the BaseReportResult schema.
   *
   * tool-driven-step-completion: adapters halt (awaiting-resume) when toolResult is null.
   */
  reportTool?: ReportToolSpec<BaseReportResult>;

  /**
   * Declare the input files this step reads (I/O contract).
   * Pure function — no I/O allowed (invariant B-5).
   * Returns resolved worktree-relative paths (util/paths functions, {n} resolved via io-iteration helpers).
   * Required inputs (required !== false) are validated before the step executes.
   * Optional for type compatibility; all 12 standard pipeline steps implement this.
   *
   * D1 (step-io-contracts): machine-readable declaration replaces prompt-prose data dependencies.
   */
  reads?(state: JobState, deps: StepDeps): IoRef[];

  /**
   * Declare the output files this step writes (I/O contract).
   * Pure function — no I/O allowed (invariant B-5).
   * Returns resolved worktree-relative paths (util/paths functions, {n} resolved via io-iteration helpers).
   * Declaration only — writes are not validated (only reads are pre-validated).
   * Optional for type compatibility; all 12 standard pipeline steps implement this.
   *
   * D1 (step-io-contracts): machine-readable declaration makes data flow explicit.
   */
  writes?(state: JobState, deps: StepDeps): IoRef[];

  /**
   * Declare additional output contracts beyond the produced contracts auto-derived from writes().
   * Pure function — no I/O allowed.
   *
   * Used to declare contracts that are not file-existence checks, e.g.:
   *   "tasks-complete": all tasks in tasks.md must be checked before the step commits.
   *
   * Optional — steps that only have file-existence contracts may omit this.
   * Steps that do not implement this are unaffected by the output gate (backward compat).
   *
   * D3 (step-completion-verification): step-declared output contracts seam.
   */
  outputContracts?(state: JobState, deps: StepDeps): OutputContract[];

  /**
   * Enrich dynamic context with step-specific data before buildMessage is called.
   * Async — I/O is allowed (unlike buildMessage which is pure).
   * Returns a new DynamicContext with additional fields populated.
   * When absent, adapter skips enrichment and uses the original dynamicContext as-is.
   *
   * Design D1 (add-spec-review-baseline-check): optional hook for I/O-heavy context
   * preparation that cannot be done inside buildMessage (pure function constraint).
   */
  enrichContext?(dynamicContext: DynamicContext, cwd: string, slug: string): Promise<DynamicContext>;

  /**
   * Declarative activation conditions for this reviewer step.
   * When present, StepExecutor evaluates the conditions before running the agent.
   * Conditions not satisfied → step is skipped (verdict: "skipped") without running the agent.
   *
   * Only set for custom reviewer steps that declare paths or requestTypes in their frontmatter.
   * Standard pipeline steps and unconstrained reviewers leave this undefined.
   *
   * Design D5 (reviewer-activation-conditions): CLI-side deterministic gate.
   */
  activation?: ReviewerActivation;

  /**
   * Custom verdict derivation for judge steps.
   * When set, executor uses this instead of deriveJudgeVerdict.
   * Only applies when isJudgeStep is true (step uses JUDGE_REPORT_TOOL or CODE_REVIEW_REPORT_TOOL).
   *
   * Use case: regression-gate needs needs-fix for ANY fixable finding (even low/medium severity),
   * unlike the standard deriveJudgeVerdict which only triggers needs-fix for critical/high severity.
   */
  judgeVerdictFn?: (findings: import("../../kernel/report-result.js").Finding[], ok: boolean) => "approved" | "needs-fix" | "escalation";

  /**
   * When true, executor detects no-op completions: if no source files changed
   * since headBeforeStep (excluding pipeline artifacts), verdict is overridden
   * from "approved"/"success" to "needs-fix".
   * Only effective when runtimeStrategy is available and headBeforeStep is non-null.
   *
   * Use case: code-fixer must produce source changes; completing without changes
   * indicates the fixer did nothing useful (fail-closed).
   */
  noOpDetect?: boolean;
}

/**
 * CliStep: a pipeline step that runs directly without a managed agent session.
 * kind: "cli" — StepExecutor calls step.run() and reads resultFilePath.
 * No agent field — CLI-resident steps (like verification) have no associated Agent.
 */
export interface CliStep {
  kind: "cli";
  /** Canonical name of this step (e.g. "verification"). */
  name: string;
  /**
   * Execute the CLI step (spawn processes, write result files, etc.).
   * StepExecutor calls this instead of creating a session.
   */
  run(state: JobState, deps: CliStepDeps): Promise<void>;
  /**
   * Compute the path of the result file written by this step.
   * Unlike AgentStep, this is non-null (CLI steps always produce a result file).
   */
  resultFilePath(state: JobState, deps: StepDeps): string;
  /**
   * Parse the result file content into a step outcome.
   * Pure function — no I/O allowed.
   */
  parseResult(content: string, deps: StepDeps): ParsedStepResult;

  /**
   * Declare the input files this step reads (I/O contract).
   * Pure function — no I/O allowed (invariant B-5).
   * Returns resolved worktree-relative paths; required inputs are pre-validated.
   * Optional for type compatibility; all 12 standard pipeline steps implement this.
   *
   * D1 (step-io-contracts): machine-readable declaration replaces prompt-prose data dependencies.
   */
  reads?(state: JobState, deps: StepDeps): IoRef[];

  /**
   * Declare the output files this step writes (I/O contract).
   * Pure function — no I/O allowed (invariant B-5).
   * Returns resolved worktree-relative paths. Declaration only — not pre-validated.
   * Optional for type compatibility; all 12 standard pipeline steps implement this.
   *
   * D1 (step-io-contracts): machine-readable declaration makes data flow explicit.
   */
  writes?(state: JobState, deps: StepDeps): IoRef[];
}

/**
 * Step is a discriminated union of AgentStep and CliStep.
 * Use step.kind to determine which variant you have.
 *
 * Design D1: explicit discriminator rather than null agent / name-based inference.
 * Design D2: plain TypeScript interface (not abstract class).
 */
export type Step = AgentStep | CliStep;
