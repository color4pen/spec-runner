/**
 * Provider lifecycle parity contract case table.
 *
 * 31 cases × 2 providers = 62 test combinations.
 *   shared:           20 cases (both providers "supported" with aligned expectations)
 *   provider-specific: 11 cases (expectations differ non-trivially, or one provider is "absent")
 *
 * Case ID allocation (from REQUIRED_CASE_IDS):
 *   main-work        2 shared
 *   report           3 shared + 2 provider-specific
 *   post-work        2 shared
 *   output-repair    3 shared
 *   transient        4 shared
 *   timeout          3 shared
 *   metrics          1 shared + 5 provider-specific
 *   context          0 shared + 3 provider-specific
 *   completion-error 2 shared + 1 provider-specific
 *   total:          20 shared + 11 provider-specific = 31
 *
 * Import rules: no provider SDK imports. Only scenario.ts, case-ids.ts, and src/ types.
 */
import type { LifecycleScenario } from "./scenario.js";
import type { REQUIRED_CASE_IDS, LIFECYCLE_AREAS } from "./case-ids.js";

// ---------------------------------------------------------------------------
// Expectation types
// ---------------------------------------------------------------------------

/**
 * Assertion expectations for a single provider run of a lifecycle case.
 *
 * Fields follow the AgentRunResult shape; absent means the corresponding
 * result field should be undefined.
 */
export interface ProviderExpectation {
  /**
   * "supported" — run the test and assert expectations.
   * "absent"    — the provider does not implement this behavior; skip the test.
   *               `reason` must be set (≥40 chars).
   */
  support: "supported" | "absent";

  /**
   * Human-readable rationale required when support === "absent" (≥40 chars).
   * Also used for provider-specific cases where both are "supported" but
   * the reason explains the implementation difference.
   */
  reason?: string;

  // -------------------------------------------------------------------
  // Core result fields
  // -------------------------------------------------------------------

  /** Expected completionReason */
  completionReason?: "success" | "error" | "timeout";

  /**
   * Expected toolResult:
   *   null            — agent did not call the report tool
   *   { ok: boolean } — agent reported with this payload
   */
  toolResult?: { ok: boolean } | null;

  /** Expected followUpAttempts count (reportRetry + outputRepair) */
  followUpAttempts?: number;

  /**
   * Expected transientRetryAttempts:
   *   number   — field present with this value
   *   "absent" — field must not be present in the result
   */
  transientRetryAttempts?: number | "absent";

  /**
   * Expected addedTurns (Claude only):
   *   object   — assert each counter
   *   "absent" — addedTurns must be undefined
   */
  addedTurns?: {
    reportRetry: number;
    postWork: number;
    outputRepair: number;
  } | "absent";

  /**
   * When true: assert that addedTurns.reportRetry + addedTurns.outputRepair === followUpAttempts.
   * Claude only; requires addedTurns to be defined.
   */
  assertAddedTurnsInvariant?: boolean;

  // -------------------------------------------------------------------
  // Result content
  // -------------------------------------------------------------------

  /**
   * Expected resultContent:
   *   string — resultContent must contain this substring
   *   null   — resultContent must be null (no result file)
   */
  resultContent?: string | null;

  // -------------------------------------------------------------------
  // Error fields
  // -------------------------------------------------------------------

  /** Expected error.code */
  errorCode?: string;

  /** Regex pattern that error.message must match */
  errorMessagePattern?: string;

  /** When true: result.error must be undefined (success path) */
  errorMustBeAbsent?: boolean;

  // -------------------------------------------------------------------
  // Metrics / diagnostics
  // -------------------------------------------------------------------

  /** When true: result.modelUsage must be defined */
  modelUsageDefined?: boolean;

  /**
   * Expected contextMetrics.contextWindowTokens value.
   * Implies fieldPresence.contextMetrics = "present".
   */
  contextWindowTokens?: number;

  /**
   * Expected invocationMetrics.numTurns value.
   * Implies fieldPresence.invocationMetrics = "present".
   */
  invocationMetricsNumTurns?: number;

  /** When true: completionReportDiagnostics must have at least one entry */
  completionReportDiagnosticsPresent?: boolean;

  /**
   * Expected sessionRollovers.length.
   * Implies fieldPresence.sessionRollovers = "present".
   */
  sessionRolloversLength?: number;

  // -------------------------------------------------------------------
  // Field-level presence checks
  // -------------------------------------------------------------------

  /**
   * Spot-check specific result fields as present (defined) or absent (undefined).
   * Keys are AgentRunResult field names.
   */
  fieldPresence?: Partial<Record<string, "present" | "absent">>;

  // -------------------------------------------------------------------
  // Invocation count
  // -------------------------------------------------------------------

  /** Expected number of SDK invocations (provider-level calls to queryFn / runStreamed) */
  sdkInvocations?: number;
}

// ---------------------------------------------------------------------------
// Contract case type
// ---------------------------------------------------------------------------

export interface ContractCase {
  /** Case identifier — must be one of REQUIRED_CASE_IDS */
  id: (typeof REQUIRED_CASE_IDS)[number];

  /** Lifecycle area — must be one of LIFECYCLE_AREAS */
  area: (typeof LIFECYCLE_AREAS)[number];

  /**
   * shared:            both providers "supported"; driver generates 2 tests
   * provider-specific: expectations differ non-trivially, or one is "absent"
   */
  classification: "shared" | "provider-specific";

  /** Provider-neutral scenario */
  scenario: LifecycleScenario;

  /** Per-provider assertions */
  expectations: {
    "claude-code": ProviderExpectation;
    codex: ProviderExpectation;
  };
}

// ---------------------------------------------------------------------------
// Case table (31 cases)
// ---------------------------------------------------------------------------

export const CONTRACT_CASES: ContractCase[] = [
  // ==========================================================================
  // main-work (2 shared)
  // ==========================================================================

  {
    id: "main-work.success-minimal",
    area: "main-work",
    classification: "shared",
    scenario: {
      turns: [{ type: "complete-without-report" }],
      afterScript: "repeat-last",
      policy: {},
      config: {},
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        completionReason: "success",
        toolResult: null,
        followUpAttempts: 0,
        // Claude: resultContent=null (no result file → step.resultFilePath returns null)
        resultContent: null,
        errorMustBeAbsent: true,
      },
      codex: {
        support: "supported",
        completionReason: "success",
        toolResult: null,
        followUpAttempts: 0,
        // Codex: resultContent=turn.finalResponse="" (no result file → use finalResponse text)
        // Do NOT assert resultContent here — providers differ in their no-file behavior.
        errorMustBeAbsent: true,
      },
    },
  },

  {
    id: "main-work.result-file-content",
    area: "main-work",
    classification: "shared",
    scenario: {
      turns: [{ type: "complete-without-report" }],
      afterScript: "repeat-last",
      policy: {},
      config: {},
      resultFile: {
        path: "result.md",
        content: "## Result\n\nImplementation complete.\n",
      },
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        completionReason: "success",
        resultContent: "Implementation complete.",
        errorMustBeAbsent: true,
      },
      codex: {
        support: "supported",
        completionReason: "success",
        resultContent: "Implementation complete.",
        errorMustBeAbsent: true,
      },
    },
  },

  // ==========================================================================
  // report (3 shared)
  // ==========================================================================

  {
    id: "report.first-turn-success",
    area: "report",
    classification: "shared",
    scenario: {
      turns: [{ type: "complete-with-report", payload: { ok: true } }],
      afterScript: "repeat-last",
      policy: { hasReportTool: true },
      config: {},
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        completionReason: "success",
        toolResult: { ok: true },
        followUpAttempts: 0,
        sdkInvocations: 1,
        errorMustBeAbsent: true,
      },
      codex: {
        support: "supported",
        completionReason: "success",
        toolResult: { ok: true },
        followUpAttempts: 0,
        sdkInvocations: 1,
        errorMustBeAbsent: true,
      },
    },
  },

  {
    id: "report.follow-up-recovers",
    area: "report",
    classification: "shared",
    scenario: {
      // Turn 0: no report. Turn 1: reports. toolReportRetryMaxAttempts=2 allows the retry.
      turns: [
        { type: "complete-without-report" },
        { type: "complete-with-report", payload: { ok: true } },
      ],
      afterScript: "repeat-last",
      policy: { hasReportTool: true, toolReportRetryMaxAttempts: 2 },
      config: {},
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        completionReason: "success",
        toolResult: { ok: true },
        followUpAttempts: 1,
        sdkInvocations: 2,
        addedTurns: { reportRetry: 1, postWork: 0, outputRepair: 0 },
        errorMustBeAbsent: true,
      },
      codex: {
        support: "supported",
        completionReason: "success",
        toolResult: { ok: true },
        followUpAttempts: 1,
        sdkInvocations: 2,
        errorMustBeAbsent: true,
      },
    },
  },

  {
    id: "report.follow-up-budget-exhausted",
    area: "report",
    classification: "shared",
    scenario: {
      // Agent never calls report; 1 retry attempt → budget exhausted.
      turns: [{ type: "complete-without-report" }],
      afterScript: "repeat-last",
      policy: { hasReportTool: true, toolReportRetryMaxAttempts: 1 },
      config: {},
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        completionReason: "success",
        toolResult: null,
        followUpAttempts: 1,
        sdkInvocations: 2,
        addedTurns: { reportRetry: 1, postWork: 0, outputRepair: 0 },
        errorMustBeAbsent: true,
      },
      codex: {
        support: "supported",
        completionReason: "success",
        toolResult: null,
        followUpAttempts: 1,
        sdkInvocations: 2,
        errorMustBeAbsent: true,
      },
    },
  },

  // ==========================================================================
  // post-work (2 shared)
  // ==========================================================================

  {
    id: "post-work.single-prompt-adds-turn",
    area: "post-work",
    classification: "shared",
    scenario: {
      // Turn 0: main work with report. Turn 1: post-work prompt response.
      turns: [
        { type: "complete-with-report", payload: { ok: true } },
        { type: "complete-without-report" },
      ],
      afterScript: "repeat-last",
      policy: { hasReportTool: true, postWorkPrompts: ["Please clean up temporary files."] },
      config: {},
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        completionReason: "success",
        toolResult: { ok: true },
        sdkInvocations: 2,
        errorMustBeAbsent: true,
      },
      codex: {
        support: "supported",
        completionReason: "success",
        toolResult: { ok: true },
        sdkInvocations: 2,
        errorMustBeAbsent: true,
      },
    },
  },

  {
    id: "post-work.excluded-from-follow-up-attempts",
    area: "post-work",
    classification: "shared",
    scenario: {
      // Same as single-prompt-adds-turn — verifies post-work is NOT in followUpAttempts.
      turns: [
        { type: "complete-with-report", payload: { ok: true } },
        { type: "complete-without-report" },
      ],
      afterScript: "repeat-last",
      policy: { hasReportTool: true, postWorkPrompts: ["Please clean up temporary files."] },
      config: {},
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        completionReason: "success",
        // post-work does NOT increment followUpAttempts
        followUpAttempts: 0,
        addedTurns: { reportRetry: 0, postWork: 1, outputRepair: 0 },
        errorMustBeAbsent: true,
      },
      codex: {
        support: "supported",
        completionReason: "success",
        // post-work does NOT increment followUpAttempts
        followUpAttempts: 0,
        errorMustBeAbsent: true,
      },
    },
  },

  // ==========================================================================
  // output-repair (3 shared)
  // ==========================================================================

  {
    id: "output-repair.violation-then-clean",
    area: "output-repair",
    classification: "shared",
    scenario: {
      // Turn 0: main work (report). Turn 1: repair response (report again).
      // detect: [1 violation, 0 violations] → loop exits after 1 repair.
      turns: [
        { type: "complete-with-report", payload: { ok: true } },
        { type: "complete-with-report", payload: { ok: true } },
      ],
      afterScript: "repeat-last",
      policy: {
        hasReportTool: true,
        outputVerification: { maxAttempts: 3, detectSequence: [1, 0] },
      },
      config: {},
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        completionReason: "success",
        followUpAttempts: 1,
        addedTurns: { reportRetry: 0, postWork: 0, outputRepair: 1 },
        sdkInvocations: 2,
        errorMustBeAbsent: true,
      },
      codex: {
        support: "supported",
        completionReason: "success",
        followUpAttempts: 1,
        sdkInvocations: 2,
        errorMustBeAbsent: true,
      },
    },
  },

  {
    id: "output-repair.budget-exhausted",
    area: "output-repair",
    classification: "shared",
    scenario: {
      // detect always returns 1 violation; maxAttempts=2 → budget exhausted after 2 repairs.
      turns: [{ type: "complete-with-report", payload: { ok: true } }],
      afterScript: "repeat-last",
      policy: {
        hasReportTool: true,
        outputVerification: { maxAttempts: 2, detectSequence: [1] },
      },
      config: {},
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        completionReason: "success",
        followUpAttempts: 2,
        addedTurns: { reportRetry: 0, postWork: 0, outputRepair: 2 },
        sdkInvocations: 3,
        errorMustBeAbsent: true,
      },
      codex: {
        support: "supported",
        completionReason: "success",
        followUpAttempts: 2,
        sdkInvocations: 3,
        errorMustBeAbsent: true,
      },
    },
  },

  {
    id: "output-repair.detect-failure-skips-loop",
    area: "output-repair",
    classification: "shared",
    scenario: {
      // detect() throws immediately → repair loop is skipped entirely.
      turns: [{ type: "complete-with-report", payload: { ok: true } }],
      afterScript: "repeat-last",
      policy: {
        hasReportTool: true,
        outputVerification: { maxAttempts: 3, detectSequence: ["throws"] },
      },
      config: {},
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        completionReason: "success",
        followUpAttempts: 0,
        addedTurns: { reportRetry: 0, postWork: 0, outputRepair: 0 },
        sdkInvocations: 1,
        errorMustBeAbsent: true,
      },
      codex: {
        support: "supported",
        completionReason: "success",
        followUpAttempts: 0,
        sdkInvocations: 1,
        errorMustBeAbsent: true,
      },
    },
  },

  // ==========================================================================
  // transient (4 shared)
  // ==========================================================================

  {
    id: "transient.retry-then-success",
    area: "transient",
    classification: "shared",
    scenario: {
      // Attempt 0: transient fail. Attempt 1 (retry): success.
      turns: [
        { type: "fail-transient" },
        { type: "complete-without-report" },
      ],
      afterScript: "repeat-last",
      policy: {},
      config: { transientRetry: { maxRetries: 2 } },
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        completionReason: "success",
        transientRetryAttempts: 1,
        sdkInvocations: 2,
        errorMustBeAbsent: true,
      },
      codex: {
        support: "supported",
        completionReason: "success",
        transientRetryAttempts: 1,
        sdkInvocations: 2,
        errorMustBeAbsent: true,
      },
    },
  },

  {
    id: "transient.budget-exhausted",
    area: "transient",
    classification: "shared",
    scenario: {
      // maxRetries=1: attempt 0 + 1 retry = 2 failures → budget exhausted.
      turns: [{ type: "fail-transient" }],
      afterScript: "repeat-last",
      policy: {},
      config: { transientRetry: { maxRetries: 1 } },
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        completionReason: "error",
        transientRetryAttempts: 1,
        errorCode: "CLAUDE_CODE_QUERY_FAILED",
        sdkInvocations: 2,
      },
      codex: {
        support: "supported",
        completionReason: "error",
        transientRetryAttempts: 1,
        errorCode: "CODEX_SDK_ERROR",
        sdkInvocations: 2,
      },
    },
  },

  {
    id: "transient.non-transient-not-retried",
    area: "transient",
    classification: "shared",
    scenario: {
      // Non-transient error: retryWithBackoff does not retry → transientRetryAttempts=0.
      turns: [{ type: "fail-non-transient" }],
      afterScript: "repeat-last",
      policy: {},
      config: { transientRetry: { maxRetries: 2 } },
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        completionReason: "error",
        transientRetryAttempts: 0,
        sdkInvocations: 1,
      },
      codex: {
        support: "supported",
        completionReason: "error",
        transientRetryAttempts: 0,
        sdkInvocations: 1,
      },
    },
  },

  {
    id: "transient.disabled-omits-attempts-field",
    area: "transient",
    classification: "shared",
    scenario: {
      // maxRetries=0: transientRetry disabled → transientRetryAttempts absent from result.
      turns: [{ type: "complete-without-report" }],
      afterScript: "repeat-last",
      policy: {},
      config: { transientRetry: { maxRetries: 0 } },
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        completionReason: "success",
        transientRetryAttempts: "absent",
        errorMustBeAbsent: true,
      },
      codex: {
        support: "supported",
        completionReason: "success",
        transientRetryAttempts: "absent",
        errorMustBeAbsent: true,
      },
    },
  },

  // ==========================================================================
  // timeout (3 shared)
  // ==========================================================================

  {
    id: "timeout.inactivity-watchdog",
    area: "timeout",
    classification: "shared",
    scenario: {
      // Agent stalls; fake-timer advance triggers inactivity watchdog at 900,000ms.
      turns: [{ type: "stall-until-abort" }],
      afterScript: "repeat-last",
      policy: {},
      config: {},
      resultFile: null,
      usesFakeTimers: true,
      timerAdvanceMs: 900_001,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        completionReason: "timeout",
        errorCode: "STEP_TIMEOUT",
      },
      codex: {
        support: "supported",
        completionReason: "timeout",
        errorCode: "STEP_TIMEOUT",
      },
    },
  },

  {
    id: "timeout.wall-clock-step-timeout",
    area: "timeout",
    classification: "shared",
    scenario: {
      // Step timeout 5,000ms; fake-timer advance triggers the wall-clock guard.
      turns: [{ type: "stall-until-abort" }],
      afterScript: "repeat-last",
      policy: {},
      config: { steps: { implementer: { timeoutMs: 5_000 } } },
      resultFile: null,
      usesFakeTimers: true,
      timerAdvanceMs: 5_001,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        completionReason: "timeout",
        errorCode: "STEP_TIMEOUT",
      },
      codex: {
        support: "supported",
        completionReason: "timeout",
        errorCode: "STEP_TIMEOUT",
      },
    },
  },

  {
    id: "timeout.abort-not-retried",
    area: "timeout",
    classification: "shared",
    scenario: {
      // Abort (timeout) must NOT trigger a transient retry, even when maxRetries=3.
      turns: [{ type: "stall-until-abort" }],
      afterScript: "repeat-last",
      policy: {},
      config: { transientRetry: { maxRetries: 3 } },
      resultFile: null,
      usesFakeTimers: true,
      timerAdvanceMs: 900_001,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        completionReason: "timeout",
        errorCode: "STEP_TIMEOUT",
        // abort is NOT retried — transientRetryAttempts stays 0
        transientRetryAttempts: 0,
      },
      codex: {
        support: "supported",
        completionReason: "timeout",
        errorCode: "STEP_TIMEOUT",
        transientRetryAttempts: 0,
      },
    },
  },

  // ==========================================================================
  // metrics (1 shared)
  // ==========================================================================

  {
    id: "metrics.session-rollovers-absent-without-rollover",
    area: "metrics",
    classification: "shared",
    scenario: {
      // Normal success with no rollover config → sessionRollovers must be absent.
      turns: [{ type: "complete-without-report" }],
      afterScript: "repeat-last",
      policy: {},
      config: {},
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        completionReason: "success",
        fieldPresence: { sessionRollovers: "absent" },
        errorMustBeAbsent: true,
      },
      codex: {
        support: "supported",
        completionReason: "success",
        // Codex never sets sessionRollovers regardless
        fieldPresence: { sessionRollovers: "absent" },
        errorMustBeAbsent: true,
      },
    },
  },

  // ==========================================================================
  // completion-error (2 shared)
  // ==========================================================================

  {
    id: "completion-error.result-file-not-found",
    area: "completion-error",
    classification: "shared",
    scenario: {
      // Step references a result file that does not exist → RESULT_FILE_NOT_FOUND.
      // resultFile.content is undefined → driver sets step.resultFilePath but does NOT
      // create the file; the adapter fails to read it.
      turns: [{ type: "complete-without-report" }],
      afterScript: "repeat-last",
      policy: {},
      config: {},
      resultFile: { path: "missing-result.md" },
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        completionReason: "error",
        errorCode: "RESULT_FILE_NOT_FOUND",
      },
      codex: {
        support: "supported",
        completionReason: "error",
        errorCode: "RESULT_FILE_NOT_FOUND",
      },
    },
  },

  {
    id: "completion-error.success-field-coherence",
    area: "completion-error",
    classification: "shared",
    scenario: {
      // On success: error must be absent (undefined).
      turns: [{ type: "complete-without-report" }],
      afterScript: "repeat-last",
      policy: {},
      config: {},
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        completionReason: "success",
        errorMustBeAbsent: true,
      },
      codex: {
        support: "supported",
        completionReason: "success",
        errorMustBeAbsent: true,
      },
    },
  },

  // ==========================================================================
  // report — provider-specific (2)
  // ==========================================================================

  {
    id: "report.settle-on-abort-with-captured-report",
    area: "report",
    classification: "provider-specific",
    scenario: {
      // Claude: report handler fires, then queryFn stalls; grace timer (60 s) fires
      // mainQueryAbort → outer catch detects settledByReport → success.
      // Codex: stallAfterReport is ignored; completes normally on turn 0.
      turns: [
        { type: "complete-with-report", payload: { ok: true }, stallAfterReport: true },
      ],
      afterScript: "repeat-last",
      policy: { hasReportTool: true },
      config: {},
      resultFile: null,
      usesFakeTimers: true,
      // Grace settle is armed at REPORT_SETTLE_GRACE_MS = 60,000ms
      timerAdvanceMs: 60_001,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        reason:
          "ClaudeCodeRunner arms a 60 s grace timer (REPORT_SETTLE_GRACE_MS) after the report handler is called; when the timer fires, mainQueryAbort fires and the outer catch detects capturedToolResult !== null, settling with completionReason=success. This grace-settle path is exercised by stalling queryFn after the report handler call and advancing fake timers.",
        completionReason: "success",
        toolResult: { ok: true },
        errorMustBeAbsent: true,
      },
      codex: {
        support: "absent",
        reason:
          "CodexAgentRunner has no mid-stream report capture; there is no grace settle mechanism. The completion report is extracted from the finalResponse at turn end, not from an MCP tool call mid-stream. stallAfterReport is ignored by the Codex harness and the turn completes normally, making this grace-settle scenario untestable for Codex.",
      },
    },
  },

  {
    id: "report.parse-failure-diagnostics",
    area: "report",
    classification: "provider-specific",
    scenario: {
      // Agent returns unparseable text instead of JSON; toolReportRetryMaxAttempts=0 prevents
      // any retry. Claude: completes without report diagnostic (MCP tool only).
      // Codex: all three JSON extraction strategies fail → diagnostics present.
      turns: [{ type: "complete-with-unparseable-report" }],
      afterScript: "repeat-last",
      policy: { hasReportTool: true, toolReportRetryMaxAttempts: 0 },
      config: {},
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "absent",
        reason:
          "ClaudeCodeRunner uses an MCP tool handler for report capture; the report is validated at the tool-call layer (Zod schema). There is no text-extraction step on the SDK finalResponse, so completionReportDiagnostics is always undefined for claude-code regardless of what text the agent emits. This diagnostic path is exclusive to Codex where JSON extraction from finalResponse can fail.",
      },
      codex: {
        support: "supported",
        reason:
          "CodexAgentRunner extracts the completion report from finalResponse text using three JSON extraction strategies (raw, code-fence, bracket). When all three fail, a CompletionReportDiagnostic entry is recorded. toolReportRetryMaxAttempts=0 prevents any retry, ensuring diagnostics are captured on the first failure.",
        completionReason: "success",
        toolResult: null,
        completionReportDiagnosticsPresent: true,
      },
    },
  },

  // ==========================================================================
  // context — provider-specific (3)
  // ==========================================================================

  {
    id: "context.exhaustion-typed-error",
    area: "context",
    classification: "provider-specific",
    scenario: {
      // Context exhaustion with no rollover budget and no transient retry.
      turns: [{ type: "fail-context-exhaustion", throwVariant: true }],
      afterScript: "repeat-last",
      policy: {},
      config: {
        transientRetry: { maxRetries: 0 },
        contextRollover: { maxRollovers: 0 },
      },
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        reason:
          "ClaudeCodeRunner inspects error messages and SDK result errors[] for context-exhaustion patterns (isContextExhaustionError) and returns errorCode=CONTEXT_WINDOW_EXHAUSTED, making exhaustion distinguishable from other failures.",
        completionReason: "error",
        errorCode: "CONTEXT_WINDOW_EXHAUSTED",
      },
      codex: {
        support: "supported",
        reason:
          "CodexAgentRunner classifies all SDK errors as CODEX_SDK_ERROR regardless of the error message; there is no context-exhaustion-specific code. Context window overflow reaches the outer catch as a generic error.",
        completionReason: "error",
        errorCode: "CODEX_SDK_ERROR",
      },
    },
  },

  {
    id: "context.rollover-recovers-in-fresh-session",
    area: "context",
    classification: "provider-specific",
    scenario: {
      // Turn 0: context exhausted. Turn 1: fresh session succeeds.
      // maxRollovers=1 allows exactly one rollover.
      turns: [
        { type: "fail-context-exhaustion", throwVariant: true },
        { type: "complete-without-report" },
      ],
      afterScript: "repeat-last",
      policy: {},
      config: {
        transientRetry: { maxRetries: 0 },
        contextRollover: { maxRollovers: 1 },
      },
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        reason:
          "ClaudeCodeRunner implements a fresh-session rollover loop for the implementer step: on CONTEXT_WINDOW_EXHAUSTED with rollover budget remaining, it discards the exhausted session and starts a new query. sessionRollovers records the discarded session ID.",
        completionReason: "success",
        sessionRolloversLength: 1,
        errorMustBeAbsent: true,
      },
      codex: {
        support: "absent",
        reason:
          "CodexAgentRunner has no context rollover mechanism; there is no CONTEXT_WINDOW_EXHAUSTED detection code and no rollover loop. Context exhaustion always terminates with CODEX_SDK_ERROR. The contextRollover.maxRollovers config field is read only by ClaudeCodeRunner.",
      },
    },
  },

  {
    id: "context.rollover-budget-exhausted",
    area: "context",
    classification: "provider-specific",
    scenario: {
      // Context exhausted on every attempt; maxRollovers=1 → 1 rollover, then budget gone.
      turns: [{ type: "fail-context-exhaustion", throwVariant: true }],
      afterScript: "repeat-last",
      policy: {},
      config: {
        transientRetry: { maxRetries: 0 },
        contextRollover: { maxRollovers: 1 },
      },
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        reason:
          "ClaudeCodeRunner rolls over once (rolloverAttempt=1 ≤ maxRollovers=1) then the second exhaustion exceeds the budget; the runner returns CONTEXT_WINDOW_EXHAUSTED. sessionRollovers records the one discarded session from the successful rollover attempt.",
        completionReason: "error",
        errorCode: "CONTEXT_WINDOW_EXHAUSTED",
        sessionRolloversLength: 1,
      },
      codex: {
        support: "absent",
        reason:
          "CodexAgentRunner has no context rollover mechanism; context exhaustion always terminates immediately with CODEX_SDK_ERROR regardless of the contextRollover.maxRollovers configuration value.",
      },
    },
  },

  // ==========================================================================
  // metrics — provider-specific (5)
  // ==========================================================================

  {
    id: "metrics.model-usage-populated",
    area: "metrics",
    classification: "provider-specific",
    scenario: {
      // Inject token counts via metrics hints so both adapters produce modelUsage.
      turns: [
        {
          type: "complete-with-report",
          payload: { ok: true },
          metrics: { inputTokens: 100, outputTokens: 50 },
        },
      ],
      afterScript: "repeat-last",
      policy: { hasReportTool: true },
      config: {},
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        reason:
          "ClaudeCodeRunner accumulates per-model token counts from SDK result messages and exposes them as a modelUsage map keyed by the SDK-reported model name (e.g. claude-sonnet-4-6).",
        completionReason: "success",
        modelUsageDefined: true,
      },
      codex: {
        support: "supported",
        reason:
          "CodexAgentRunner maps the turn.completed usage event to a single modelUsage entry keyed by the resolved config model name; the per-model shape differs from Claude's accumulated map.",
        completionReason: "success",
        modelUsageDefined: true,
      },
    },
  },

  {
    id: "metrics.invocation-metrics-presence",
    area: "metrics",
    classification: "provider-specific",
    scenario: {
      // Inject invocation metadata via metrics hints.
      turns: [
        {
          type: "complete-without-report",
          metrics: {
            numTurns: 1,
            durationMs: 1234,
            durationApiMs: 1000,
            totalCostUsd: 0.01,
          },
        },
      ],
      afterScript: "repeat-last",
      policy: {},
      config: {},
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        reason:
          "ClaudeCodeRunner extracts num_turns, duration_ms, duration_api_ms, and total_cost_usd from the SDK result message and populates invocationMetrics with these per-invocation summary fields.",
        completionReason: "success",
        fieldPresence: { invocationMetrics: "present" },
        invocationMetricsNumTurns: 1,
      },
      codex: {
        support: "absent",
        reason:
          "CodexAgentRunner does not receive per-invocation summary metrics from the Codex SDK; there is no equivalent to Claude's num_turns / duration_ms result fields. invocationMetrics is always undefined for the Codex adapter.",
        fieldPresence: { invocationMetrics: "absent" },
      },
    },
  },

  {
    id: "metrics.context-metrics-presence",
    area: "metrics",
    classification: "provider-specific",
    scenario: {
      // Inject contextWindowTokens so observeResult populates contextMetrics (Claude only).
      turns: [
        {
          type: "complete-without-report",
          metrics: {
            inputTokens: 100,
            outputTokens: 50,
            contextWindowTokens: 200_000,
          },
        },
      ],
      afterScript: "repeat-last",
      policy: {},
      config: {},
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        reason:
          "ClaudeCodeRunner passes the SDK result through contextObserver.observeResult() which reads modelUsage[model].contextWindow and sets contextWindowTokens. The observer snapshot is returned as contextMetrics when at least one field is populated.",
        completionReason: "success",
        fieldPresence: { contextMetrics: "present" },
        contextWindowTokens: 200_000,
      },
      codex: {
        support: "absent",
        reason:
          "The Codex SDK does not expose a context window size, compaction events, or per-request context metrics; contextMetrics is always undefined for CodexAgentRunner. The contextWindowTokens hint is ignored by the Codex harness.",
        fieldPresence: { contextMetrics: "absent" },
      },
    },
  },

  {
    id: "metrics.touched-files-presence",
    area: "metrics",
    classification: "provider-specific",
    scenario: {
      turns: [{ type: "complete-without-report" }],
      afterScript: "repeat-last",
      policy: {},
      config: {},
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        reason:
          "ClaudeCodeRunner accumulates assistant messages during the run and extracts worktree-relative file paths touched by Edit/Write tool calls via extractTouchedFilesFromMessages. touchedFiles is always a string[] (possibly empty) — defined even when no files are touched.",
        completionReason: "success",
        fieldPresence: { touchedFiles: "present" },
      },
      codex: {
        support: "absent",
        reason:
          "The Codex SDK does not report file-touch information in a form compatible with the touchedFiles contract; CodexAgentRunner never populates touchedFiles. The field is always undefined for the Codex adapter.",
        fieldPresence: { touchedFiles: "absent" },
      },
    },
  },

  {
    id: "metrics.added-turns-invariant",
    area: "metrics",
    classification: "provider-specific",
    scenario: {
      // Follow-up recovers on turn 1: reportRetry=1. outputRepair=0.
      // Invariant: reportRetry + outputRepair === followUpAttempts (1).
      turns: [
        { type: "complete-without-report" },
        { type: "complete-with-report", payload: { ok: true } },
      ],
      afterScript: "repeat-last",
      policy: { hasReportTool: true, toolReportRetryMaxAttempts: 2 },
      config: {},
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        reason:
          "ClaudeCodeRunner tracks reportRetry, postWork, and outputRepair counters separately. The invariant reportRetry + outputRepair === followUpAttempts must hold on every success path; postWork is deliberately excluded from followUpAttempts.",
        completionReason: "success",
        followUpAttempts: 1,
        addedTurns: { reportRetry: 1, postWork: 0, outputRepair: 0 },
        assertAddedTurnsInvariant: true,
      },
      codex: {
        support: "absent",
        reason:
          "CodexAgentRunner does not maintain per-type added-turn counters (reportRetry / postWork / outputRepair). addedTurns is always undefined for the Codex adapter; the invariant cannot be verified.",
        fieldPresence: { addedTurns: "absent" },
      },
    },
  },

  // ==========================================================================
  // completion-error — provider-specific (1)
  // ==========================================================================

  {
    id: "completion-error.generic-sdk-failure-code",
    area: "completion-error",
    classification: "provider-specific",
    scenario: {
      // Non-transient fatal error with retry disabled.
      turns: [{ type: "fail-non-transient" }],
      afterScript: "repeat-last",
      policy: {},
      config: { transientRetry: { maxRetries: 0 } },
      resultFile: null,
      usesFakeTimers: false,
    },
    expectations: {
      "claude-code": {
        support: "supported",
        reason:
          "ClaudeCodeRunner wraps SDK query errors with error.code=CLAUDE_CODE_QUERY_FAILED; the error message is prefixed with 'Claude Code SDK query failed: ' followed by the original error message.",
        completionReason: "error",
        errorCode: "CLAUDE_CODE_QUERY_FAILED",
        errorMessagePattern: "Claude Code SDK query failed",
      },
      codex: {
        support: "supported",
        reason:
          "CodexAgentRunner classifies all unhandled SDK errors (including transient and non-transient failures) as CODEX_SDK_ERROR; there is no sub-classification by error type.",
        completionReason: "error",
        errorCode: "CODEX_SDK_ERROR",
      },
    },
  },
];
