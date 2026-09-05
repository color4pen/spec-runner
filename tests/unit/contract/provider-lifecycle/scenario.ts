/**
 * Provider-neutral lifecycle scenario types.
 *
 * A LifecycleScenario describes what the agent does during a run without
 * referencing provider-specific SDK types. Provider harnesses (harness/claude-code.ts,
 * harness/codex.ts) translate each TurnBehavior into the appropriate SDK events.
 *
 * Import rules: no imports from adapter/claude-code, adapter/codex, or provider SDK
 * packages. Imports from src/core/port/, src/state/, src/config/ are allowed.
 */
import type { AgentRunContext } from "../../../../src/core/port/agent-runner.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";

/**
 * Optional provider-neutral usage/metrics hints for a successful turn.
 * When specified, the harness injects these values into the SDK result.
 * When absent, the harness omits the corresponding keys.
 */
export interface UsageHints {
  /** Input token count */
  inputTokens?: number;
  /** Output token count */
  outputTokens?: number;
  /** Cache-read input token count */
  cacheReadInputTokens?: number;
  /** Number of conversation turns (Claude: num_turns) */
  numTurns?: number;
  /** Total wall-clock duration in ms (Claude: duration_ms) */
  durationMs?: number;
  /** API time in ms (Claude: duration_api_ms) */
  durationApiMs?: number;
  /** Total cost in USD (Claude: total_cost_usd) */
  totalCostUsd?: number;
  /** Model name override (defaults to step agent model) */
  modelName?: string;
  /** Session ID override */
  sessionId?: string;
  /**
   * Context window size in tokens.
   * Claude: injected into modelUsage[model].contextWindow so observeResult() sets contextWindowTokens.
   * Codex: ignored (Codex SDK does not expose context window metrics).
   */
  contextWindowTokens?: number;
}

/**
 * Provider-neutral classification of one SDK-level invocation's session usage.
 *
 *   "fresh"    — the invocation starts a new provider session
 *                (Claude: query() without `options.resume`; Codex: runStreamed() on a
 *                thread that startThread() just created).
 *   "continue" — the invocation continues the session of an earlier invocation
 *                (Claude: query() with `options.resume`; Codex: runStreamed() on an
 *                already-used thread, or on a thread returned by resumeThread()).
 *
 * Observed at the SDK boundary by each harness (HarnessBuildResult.getSessionTrace)
 * so that "retry continues the same session" vs "retry moves to a fresh session"
 * is pinned independently of the invocation count (request.md 「retry時にsessionを
 * 継続するかfresh sessionへ移るか」).
 */
export type SessionInvocationKind = "fresh" | "continue";

/**
 * Behavior for a single SDK invocation turn.
 *
 * Identifiers match design D2 (scenario.ts):
 *   complete-with-report              — success + report captured
 *   complete-without-report           — success, agent did not call report tool
 *   complete-with-unparseable-report  — success, report text cannot be parsed as JSON
 *   fail-transient                    — throws / emits error with a transient pattern
 *   fail-non-transient                — throws / emits error with a non-transient pattern
 *   fail-context-exhaustion           — context window limit reached
 *   stall-until-abort                 — blocks until the abort signal fires
 *
 * Provider translation notes (documented in harness files):
 *   - Claude: complete-with-report calls the MCP handler then yields a success result.
 *   - Codex:  complete-with-report emits item.completed with JSON then turn.completed.
 *   - Both:   fail-transient uses an ECONNREFUSED message.
 *   - Claude: stall-until-abort waits on params.options.abortController.signal.
 *   - Codex:  stall-until-abort waits on opts.signal.
 *
 * stallAfterReport (complete-with-report only):
 *   When true the Claude harness calls the report handler and then stalls, waiting
 *   for mainQueryAbort (fired by the REPORT_SETTLE_GRACE_MS grace timer) rather than
 *   yielding a success result immediately. The Codex harness ignores this flag and
 *   completes normally (Codex has no mid-stream report reception).
 */
export type TurnBehavior =
  | {
      type: "complete-with-report";
      payload?: { ok: boolean };
      /** Claude only: stall after report handler is called, await grace abort */
      stallAfterReport?: boolean;
      metrics?: UsageHints;
    }
  | { type: "complete-without-report"; metrics?: UsageHints }
  | { type: "complete-with-unparseable-report"; metrics?: UsageHints }
  | { type: "fail-transient" }
  | { type: "fail-non-transient" }
  | {
      type: "fail-context-exhaustion";
      /**
       * When true the harness throws an Error instead of emitting an error
       * result/event. Exercised by context.exhaustion-typed-error (throw path).
       */
      throwVariant?: boolean;
    }
  | {
      type: "stall-until-abort";
      /** Tool name to announce before stalling (emits step:progress) */
      toolName?: string;
      /** Tool target to include in the progress payload */
      toolTarget?: string;
    };

/**
 * Scenario-level output verification descriptor.
 * The harness builds an OutputVerificationPolicy from this.
 *
 * detectSequence: each element is the violation count for that detect() call.
 *   - 0 = no violations (loop exits immediately)
 *   - >0 = that many follow-up violations (loop sends repair prompt)
 *   - "throws" = detect() throws (loop breaks immediately)
 * After the declared elements are exhausted, the last element repeats (afterScript).
 */
export interface OutputVerificationDescriptor {
  /** Maximum repair attempts before giving up. */
  maxAttempts: number;
  /** Violation count or "throws" per detect() call. Last element repeats. */
  detectSequence: Array<number | "throws">;
}

/**
 * Provider-neutral policy declaration for a scenario.
 * Harnesses convert this into concrete AgentRunPolicy.
 */
export interface ScenarioPolicy {
  /** Whether to register the report_result tool */
  hasReportTool?: boolean;
  /** postWorkPrompts to send after main work turn */
  postWorkPrompts?: string[];
  /**
   * Follow-up retry limit for report_result (overrides DEFAULT_TOOL_RETRY.maxAttempts).
   * When absent the default (2) is used.
   */
  toolReportRetryMaxAttempts?: number;
  /** Output verification descriptor. When absent no verification loop runs. */
  outputVerification?: OutputVerificationDescriptor;
}

/**
 * Provider-neutral config overrides for a scenario.
 * Harnesses merge these onto the base SpecRunnerConfig.
 */
export interface ScenarioConfig {
  /** Transient retry settings */
  transientRetry?: { maxRetries: number };
  /** Context rollover settings (Claude only; Codex ignores) */
  contextRollover?: { maxRollovers: number };
  /** Step-level config — keyed by step name */
  steps?: {
    implementer?: { timeoutMs?: number };
  };
}

/**
 * Result file descriptor for a scenario.
 * null = no result file (resultFilePath returns null).
 * { path, content } = create the file in tempDir before run().
 */
export type ResultFileDescriptor =
  | null
  | { path: string; content?: string };

/**
 * Provider-neutral lifecycle scenario.
 *
 * turns: ordered list of turn behaviors. After all declared turns are consumed,
 *   subsequent SDK invocations use the last declared turn (afterScript: "repeat-last").
 * afterScript: always "repeat-last" (constant per T-02).
 * policy: tool registration and follow-up turn declarations.
 * config: config overrides for this scenario.
 * resultFile: file to create in tempDir, or null.
 * usesFakeTimers: when true the driver enables vi.useFakeTimers() for the test.
 */
export interface LifecycleScenario {
  turns: TurnBehavior[];
  afterScript: "repeat-last";
  policy: ScenarioPolicy;
  config: ScenarioConfig;
  resultFile: ResultFileDescriptor;
  usesFakeTimers: boolean;
  /**
   * When usesFakeTimers is true: milliseconds to advance fake timers.
   * Default (when omitted): INACTIVITY_THRESHOLD_MS + 1 = 900_001.
   * Set explicitly for:
   *   - Grace settle test: 60_001 (REPORT_SETTLE_GRACE_MS + 1)
   *   - Step timeout test: config.steps.implementer.timeoutMs + 1
   */
  timerAdvanceMs?: number;
}

/**
 * Minimal base AgentRunContext for contract tests.
 * step.name = "implementer" — required for Claude rollover gate.
 * slug / branch / state follow the existing contract test fixture convention.
 *
 * @param overrides Partial overrides applied after building the base context.
 */
export function buildBaseContext(
  tempDir: string,
  overrides: Partial<AgentRunContext> = {},
): AgentRunContext {
  const state: JobState = {
    version: 2,
    jobId: "parity-contract-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: "/req.md",
      title: "Parity Contract Test",
      type: "bug-fix",
      slug: "parity-slug",
    },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "implementer",
    status: "running",
    branch: "feat/parity-test",
    history: [],
    error: null,
    steps: {},
  };

  return {
    step: {
      kind: "agent",
      name: "implementer",
      agent: {
        name: "specrunner-implementer",
        role: "implementer",
        model: "claude-sonnet-4-6",
        system: "implement",
        tools: [],
      },
      toolHandlers: undefined,
      buildMessage: () => "implement this",
      resultFilePath: () => null,
      parseResult: () => ({ verdict: "approved" as const, findingsPath: null }),
    },
    state,
    branch: "feat/parity-test",
    slug: "parity-slug",
    cwd: tempDir,
    config: { version: 1, runtime: "local", agents: {} } satisfies SpecRunnerConfig,
    input: { requestContent: "implement this" },
    session: {},
    policy: {},
    emit: () => {},
    ...overrides,
  };
}
