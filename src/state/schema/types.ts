/**
 * Job state schema types: status, step names, and the JobState shape.
 */
export type JobStatus = "running" | "awaiting-resume" | "awaiting-archive" | "failed" | "terminated" | "archived" | "canceled";

import type { ModelUsage } from "../../kernel/model-usage.js";
import type { BaseReportResult, Finding, Observation, DecisionOption, FindingSeverity } from "../../kernel/report-result.js";
import type { CompletionReportDiagnostic } from "../../kernel/completion-report-diagnostic.js";
import type { AgentStepName as AgentStepNameUnion } from "../../kernel/agent-definition.js";
import type { ReviewerSnapshot, ReviewerStatus } from "../../kernel/reviewer-snapshot.js";
export type { ReviewerStatus } from "../../kernel/reviewer-snapshot.js";
/**
 * Re-export from canonical location in the kernel layer.
 * Both the port layer and state layer reference this single definition.
 */
export type { ModelUsage } from "../../kernel/model-usage.js";

import { AGENT_STEP_NAMES, CLI_STEP_NAMES } from "../../kernel/step-names.js";

/**
 * StepName: extended to string to support arbitrary step names in records.
 * Whitelist enforcement (standard pipeline steps) is done by isStandardStepName()
 * in core/step/step-names.ts. The STEP_NAMES / AGENT_STEP_NAMES / CLI_STEP_NAMES
 * arrays remain the single source of truth for standard pipeline step names.
 */
export type StepName = string;

/**
 * AgentStepName: names of steps that run as AI agent sessions.
 * Derived from AGENT_STEP_NAMES whitelist — new steps must be added to the appropriate array.
 */
export type AgentStepName = typeof AGENT_STEP_NAMES[number];

// ---------------------------------------------------------------------------
// Compile-time sync guard: AGENT_STEP_NAMES (kernel/step-names.ts) ↔ AgentStepName (kernel/agent-definition.ts)
//
// Enforces bidirectional consistency between the runtime array and the literal
// union.  If either side is updated without updating the other, `tsc` fails here.
// To fix: update AGENT_STEP_NAMES in kernel/step-names.ts AND AgentStepName in
// kernel/agent-definition.ts so both sides contain exactly the same step names.
//
// Technique: Exclude<A, B> extends never — non-distributive check that catches
// values present in A but absent in B (and vice versa for the reverse direction).
// ---------------------------------------------------------------------------
type _AssertNever<T extends never> = T;
// Direction 1: array → union (catches values in AGENT_STEP_NAMES not in AgentStepName)
type _AgentStepExtraInArray = _AssertNever<Exclude<typeof AGENT_STEP_NAMES[number], AgentStepNameUnion>>;
// Direction 2: union → array (catches values in AgentStepName not in AGENT_STEP_NAMES)
type _AgentStepExtraInUnion = _AssertNever<Exclude<AgentStepNameUnion, typeof AGENT_STEP_NAMES[number]>>;

/**
 * CliStepName: names of steps that run as deterministic CLI processes.
 * Derived from CLI_STEP_NAMES whitelist.
 */
export type CliStepName = typeof CLI_STEP_NAMES[number];

export type Verdict =
  | "approved"
  | "needs-fix"
  | "escalation"
  | "passed"
  | "failed"
  | "success"
  | "error"
  | "skipped"
  | "strategy-deferred";

export interface HistoryEntry {
  ts: string;
  step: string;
  status: "started" | "ok" | "error" | "warning";
  message: string;
}

export interface SessionInfo {
  id: string;
  agentId: string;
  environmentId: string;
}

export interface RequestInfo {
  path: string;
  title: string;
  type: string;
  /** Canonical slug for this request. Populated from pipeline-context.md at job start.
   * null for legacy state files or non-canonical paths (e.g. /tmp/...).
   * Optional for backward compat — absent in existing state files. */
  slug?: string | null;
  /** Base branch for this request (e.g. "main", "develop").
   * Set from request.md base-branch at job start.
   * Optional for backward compat — absent in legacy state files.
   * When absent, escalation notifications fall back to "main". */
  baseBranch?: string | null;
}

export interface RepositoryInfo {
  owner: string;
  name: string;
}

export interface ErrorInfo {
  code: string;
  message: string;
  hint: string;
}

export interface ResumePoint {
  step: StepName;
  reason: string;
  iterationsExhausted: number;
  /** Diagnostic: distinguishes "fixer ran to completion then review rejected" from "review exhausted before fixer max". */
  exhaustionPhase?: "review-after-final-fix" | "review-exhausted";
}

// ---------------------------------------------------------------------------
// StepRun — new schema (D1). Replaces StepResult[] in JobStateStore.
// ---------------------------------------------------------------------------

/**
 * Outcome of a single step execution.
 */
export interface StepOutcome {
  verdict: Verdict | string | null;
  findingsPath: string | null;
  error: ErrorInfo | null;
  /**
   * Result reported by the agent via report_result tool call.
   * null = tool was not called. undefined = field absent (legacy records).
   * Added in tool-driven-step-completion.
   * Widened to include findings and observations arrays for judge steps.
   */
  toolResult?: (BaseReportResult & { findings?: Finding[]; observations?: Observation[] }) | null;
  /**
   * Number of follow-up retry attempts made to get the agent to call report_result.
   * 0 = the agent called the tool on the first turn (or feature not applicable).
   * Added in tool-driven-step-completion.
   */
  followUpAttempts?: number;
  /**
   * Number of transient-error auto-retry attempts made before this step succeeded
   * or the retry budget was exhausted.
   * 0 = no retries needed. Absent when feature was disabled (maxRetries: 0).
   * Added in transient-error-auto-retry.
   */
  transientRetryAttempts?: number;
  /**
   * Human-readable reason for a skipped verdict.
   * Only present when verdict === "skipped".
   * Documents which activation condition was not satisfied.
   */
  skipReason?: string;
  /**
   * Diagnostics from failed completion-report extraction attempts (Codex adapter only).
   * Adapter-populated; absent on success.
   * Added in codex-completion-contract-injection.
   */
  completionReportDiagnostics?: CompletionReportDiagnostic[];
  /**
   * Added-turn metrics broken down by type (local runtime only).
   * - reportRetry: turns spent retrying the report_result tool call.
   * - postWork: turns spent on postWorkPrompts (NOT counted in followUpAttempts).
   * - outputRepair: turns spent repairing output-contract violations.
   * Invariant: reportRetry + outputRepair === followUpAttempts.
   * Added in reduce-added-agent-turns.
   */
  addedTurns?: { reportRetry: number; postWork: number; outputRepair: number };
}

/**
 * StepRun records a single execution attempt of a named step.
 * Replaces StepResult[] for new state files.
 */
export interface StepRun {
  /** 1-origin attempt number within this step. Auto-assigned. */
  attempt: number;
  sessionId: string | null;
  outcome: StepOutcome;
  /** ISO 8601 timestamp when this attempt started. */
  startedAt: string;
  /** ISO 8601 timestamp when this attempt ended. */
  endedAt: string;
  /**
   * Per-model token usage from the agent run.
   * Keys are model names (e.g. "claude-opus-4-6").
   * Only present for ClaudeCodeRunner steps; absent for ManagedAgentRunner and CLI steps.
   */
  modelUsage?: Record<string, ModelUsage>;
  /**
   * The commit OID (SHA) captured immediately after this node's per-node commit
   * (`finalizeStepArtifacts` / `commitAndPush`).
   *
   * Set only for sequential agent/CLI steps that own their own git commit.
   * Round (parallel reviewer) members do NOT set this field — their git effects
   * are committed by the coordinator via `commitRoundArtifacts`.
   *
   * Used by the bite-evidence gate (R4) to identify the base (test-materialize)
   * and candidate (implementer) OIDs for isolated test execution.
   */
  commitOid?: string;
}

export interface StepResult {
  /** 1-origin iteration number within the step. Auto-assigned by pushStepResult. */
  iteration: number;
  session: SessionInfo | null;
  verdict: Verdict | string | null;
  findingsPath: string | null;
  completedAt: string | null;
  error: ErrorInfo | null;
}

export interface PullRequestInfo {
  url: string;
  number: number;
  createdAt: string;
}

/**
 * A snapshot of a finding stored in the decision ledger.
 * Captures the fields that identify and describe the finding at the time of the decision.
 */
export interface DecisionFindingSnapshot {
  title: string;
  file: string;
  line?: number;
  rationale: string;
  severity: FindingSeverity;
  options?: DecisionOption[];
}

/**
 * A single selected option recorded in the decision ledger.
 */
export interface DecisionSelectedOption {
  /** 1-based index of the selected option within the finding's options array. */
  number: number;
  label: string;
  consequence: string;
}

/**
 * A recorded human decision for a `decision-needed` finding.
 * Persisted in `JobState.decisions` before the job resumes.
 * Verdict derivation uses the decision ledger to suppress re-escalation of already-decided findings.
 */
export interface DecisionRecord {
  /** Stable unique ID for this decision record (e.g. "decision-<ISO timestamp>-<counter>"). */
  id: string;
  /** Step that produced the decision-needed finding (e.g. "spec-review"). */
  step: string;
  /** Deterministic finding key derived from step, file, line, title, and rationale (normalized). */
  findingKey: string;
  /** Snapshot of the finding at the time the decision was made. */
  finding: DecisionFindingSnapshot;
  /** The option selected by the human. */
  selectedOption: DecisionSelectedOption;
  /** Raw /resume comment body or prose supplement when available. */
  resumeComment?: string;
  /** ISO 8601 timestamp when the decision was recorded. */
  decidedAt: string;
  /** How the decision was sourced. Currently always "issue-comment". */
  source: "issue-comment";
}

/**
 * Opaque recorded structure for the budget component of an effective profile.
 * R1: treated as opaque by the runtime (value-based enforcement is R2–R6).
 */
export type ProfileBudget = Readonly<Record<string, unknown>>;

/**
 * Lattice levels for the testDerivation assurance field.
 * Ordered from weakest (coupled) to strongest (frozen).
 */
export type TestDerivationLevel = "coupled" | "frozen";

/**
 * Lattice levels for the biteEvidence assurance field.
 * Ordered from weakest (optional) to strongest (required).
 */
export type BiteEvidenceLevel = "optional" | "required";

/**
 * Lattice levels for the specReview assurance field.
 * Ordered from weakest (omitted) to strongest (required).
 */
export type SpecReviewLevel = "omitted" | "required";

/**
 * Assurance component of an effective profile.
 * R1 opaque record からの widening。named typed フィールドは floor 比較用、
 * index signature は R1 記録値との後方互換用。
 *
 * The index signature covers all fields (including testDerivation, biteEvidence,
 * specReview) so that any string value — including unrecognized runtime values —
 * is assignable. Floor comparison uses runtime rank maps in satisfiesFloor(),
 * not TypeScript field types, to fail-closed on unknown values.
 */
export interface ProfileAssurance {
  /** Index signature for R1 backward compatibility and runtime flexibility.
   * Floor-comparable named keys: testDerivation, biteEvidence, specReview.
   * These are read as unknown and evaluated via rank maps in satisfiesFloor. */
  readonly [key: string]: unknown;
  /** Level of test derivation assurance. Ordered: coupled < frozen. */
  readonly testDerivation?: TestDerivationLevel;
  /** Level of bite evidence assurance. Ordered: optional < required. */
  readonly biteEvidence?: BiteEvidenceLevel;
  /** Level of spec review assurance. Ordered: omitted < required. */
  readonly specReview?: SpecReviewLevel;
}

/**
 * Effective profile: the branch-borne execution guarantee declaration for a job.
 * Recorded at job creation; immutable for the job's lifetime.
 *
 * - id: human-readable profile identifier (e.g. "standard").
 * - schemaVersion: version of the profile schema. Must be ≤ SUPPORTED_PROFILE_SCHEMA_VERSION.
 * - policyDigest: SHA-256 hash of the profile body (id, schemaVersion, budget, assurance).
 *   Verified at attach time for self-consistency.
 * - budget: opaque recorded budget structure (R1: not interpreted by runtime).
 * - assurance: opaque recorded assurance structure (R1: not interpreted by runtime).
 */
export interface EffectiveProfile {
  id: string;
  schemaVersion: number;
  policyDigest: string;
  budget: ProfileBudget;
  assurance: ProfileAssurance;
}

/**
 * A single bite-evidence record for one test file.
 * Generated by the bite-evidence gate (R4 forward strategy).
 *
 * - testId: worktree-relative test file path (e.g. "src/__tests__/foo.test.ts").
 * - strategy: "forward" — base-red→candidate-green verification (currently the only strategy).
 * - baseResult: "red" if the test failed at the base OID (expected for a real tooth), "green" if hollow.
 * - candidateResult: "green" if the test passed at the candidate OID, "red" if the impl did not fix it.
 * - verified: true iff base-red AND candidate-green (the tooth is real).
 */
export interface BiteEvidenceRecord {
  testId: string;
  strategy: "forward";
  baseResult: "red" | "green";
  candidateResult: "red" | "green";
  verified: boolean;
  /**
   * Final HEAD binding fields for the archive floor gate (assurance-provenance-floor).
   * All optional for backward compatibility — records without these fields remain valid.
   * - baseOid:      commit OID of the test-materialize step (base boundary).
   * - candidateOid: commit OID of the implementer step (candidate boundary).
   * - testHash:     content digest of the test file at baseOid ("sha256:..." format).
   *                 Used for freeze / tamper detection at the archive gate.
   */
  baseOid?: string;
  candidateOid?: string;
  testHash?: string;
}

export interface JobState {
  /**
   * Schema version.
   * - 1: original version (pre-artifact-observability R5)
   * - 2: introduces lineage recording (journal-side) and arbitrary step name support.
   * Backward compat: version 1 state files are accepted and normalized to 2 on read
   * (validateJobState). New state files always write version 2 (buildInitialJobState).
   */
  version: 1 | 2;
  jobId: string;
  createdAt: string;
  updatedAt: string;
  request: RequestInfo;
  repository: RepositoryInfo;
  session: SessionInfo | null;
  step: string;
  status: JobStatus;
  branch: string | null;
  history: HistoryEntry[];
  error: ErrorInfo | null;
  /** Step-level results journal (array per step for iteration tracking). Optional for backward compat with v1 files. */
  steps?: Record<string, StepRun[]>;
  /** PR info recorded after pr-create step succeeds. Optional for backward compat with legacy state files. */
  pullRequest?: PullRequestInfo;
  /**
   * Path to the persistent git worktree created for this job (local runtime only).
   * Set at job start; cleared to null on finish.
   * Optional for backward compat — absent in legacy state files → treated as undefined.
   */
  worktreePath?: string | null;
  /**
   * Identifies which pipeline definition was used to execute this job.
   * Recorded at job creation; absent in legacy state files.
   * When missing, getPipelineId resolves to "standard".
   * Optional for backward compat — absent in legacy state is valid.
   */
  pipelineId?: string;
  /**
   * Effective profile: the branch-borne execution guarantee declaration for this job.
   * Recorded at job creation; immutable for the job's lifetime.
   * Absent in legacy state files — getProfile() resolves absent to STANDARD_PROFILE.
   * Optional for backward compat — absent in legacy state is valid.
   */
  profile?: EffectiveProfile;
  resumePoint?: ResumePoint | null;
  /** PID of the process that set status to "running". Optional for backward compat. */
  pid?: number | null;
  /** ISO 8601 timestamp when the job was canceled. Set by `job cancel`. Optional. */
  canceledAt?: string;
  /**
   * Indicates this job was executed in no-worktree mode (--no-worktree flag).
   * Portable: written to state.json and readable by the archive command in a
   * separate process to skip worktree remove/prune.
   * Absent (undefined) means the job ran in normal worktree mode.
   */
  noWorktree?: boolean;
  /**
   * GitHub issue number this job is linked to via `--issue <number>`.
   * When set, terminal transitions (awaiting-resume / awaiting-archive) write
   * a comment to the linked issue via GitHubClient.createIssueComment.
   * Absent (undefined) means no issue is linked — notification is suppressed.
   * Optional for backward compat — absent in legacy state files is valid.
   */
  issueNumber?: number | null;
  /**
   * Crash-loop guard for inbox auto-recovery of orphaned running jobs.
   * - attempts: consecutive auto-recoveries with no progress since the last recovery.
   * - stepCount: total step-run count (Σ steps[*].length) observed at the last recovery,
   *   used as a progress fingerprint. When the current count differs, attempts resets to 0.
   * Optional for backward compat — absent/null in existing state files is valid.
   */
  staleRecovery?: { attempts: number; stepCount: number } | null;
  /**
   * Snapshot of custom reviewer definitions captured at job start.
   * Used by composeReviewerDescriptor to build the pipeline shape for this job.
   * Absent in legacy state files and jobs with no custom reviewers (treated as []).
   * Optional for backward compat.
   */
  reviewers?: ReviewerSnapshot[];
  /**
   * Human decision ledger — records of decisions made for `decision-needed` findings.
   * Verdict derivation uses this ledger to suppress re-escalation of already-decided findings.
   * Absent (undefined/null) in legacy state files → treated as an empty ledger (no decisions).
   * Optional for backward compat.
   */
  decisions?: DecisionRecord[];
  /**
   * Per-reviewer execution status records for custom reviewer parallel execution.
   *
   * Design D1 (reviewer-parallel-execution): tracks each reviewer's status
   * (pending / approved / skipped) and approvedAtCommit for invalidation.
   *
   * state.json projection で round-trip、event-journal threading 不要
   * (`reviewers` / `decisions` と同型の top-level フィールド)。
   *
   * Absent in jobs without custom reviewers and in legacy state files.
   * Optional for backward compat.
   */
  reviewerStatuses?: ReviewerStatus[];
  /**
   * Records main-checkout drift detected during an agent step boundary check.
   *
   * Set when StepExecutor detects that guarded paths in the main checkout were
   * modified while a worktree-mode agent step was running.
   *
   * Absence (undefined/null) means no drift was detected or the check did not run
   * (no-worktree mode, managed runtime, or no forbiddenSurfaces configured).
   * Optional for backward compat — absent in legacy state files is valid.
   */
  mainCheckoutDrift?: {
    changes: { path: string; kind: "created" | "modified" | "deleted" }[];
    detectedAtStep: StepName;
    ts: string;
  } | null;
  /**
   * Bite-evidence records generated by the forward-strategy gate (R4).
   * Each record documents a single materialized test file's base/candidate execution results.
   * Absent for non-forward strategy jobs or when the gate ran in strategy-deferred mode.
   * Optional for backward compat — absent in legacy state files is valid.
   */
  biteEvidence?: BiteEvidenceRecord[];
}

/**
 * Maximum number of history entries shown in display/UI (e.g. job show).
 * Persistent storage (events.jsonl) retains the full journal without truncation (D4).
 * Display layer uses this cap to limit output.
 */
