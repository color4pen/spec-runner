/**
 * Provider harness interface and shared build options.
 *
 * Import rules:
 *   - No imports from adapter/claude-code, adapter/codex, or provider SDK packages.
 *   - Imports from src/core/port/, src/state/, src/config/ are allowed.
 *   - LifecycleScenario and buildBaseContext are imported from ../scenario.ts.
 */
import type { AgentRunner } from "../../../../../src/core/port/agent-runner.js";
import type { LifecycleScenario, SessionInvocationKind } from "../scenario.js";

/**
 * Options passed to ProviderHarness.build().
 */
export interface HarnessBuildOpts {
  /** Temporary directory for the agent working directory. */
  tempDir: string;
  /** Immediate-resolve sleep function (eliminates real-time backoff waits). */
  sleepFn: (ms: number) => Promise<void>;
  /** Emit function for collecting domain events emitted during the run. */
  emit: (event: string, payload: Record<string, unknown>) => void;
}

/**
 * One entry of the provider-neutral session invocation trace.
 *
 * kind:      whether this SDK invocation started a fresh session or continued one
 *            (see SessionInvocationKind in scenario.ts).
 * sessionId: the provider session identifier the invocation is bound to.
 *            Claude: `options.resume` for "continue"; for "fresh" the `session_id` the
 *            invocation yielded (undefined when it threw before yielding).
 *            Codex: the thread id runStreamed() was called on.
 *            The driver asserts that every "continue" entry targets the sessionId of
 *            the immediately preceding entry (session continuity invariant).
 */
export interface SessionInvocationRecord {
  kind: SessionInvocationKind;
  sessionId: string | undefined;
}

/**
 * Result of ProviderHarness.build().
 * runner: ready-to-use AgentRunner (implements the port contract).
 * getInvocationCount: returns the total number of SDK-level invocations made
 *   (main + follow-up + repair turns, measured at the SDK boundary).
 * getSessionTrace: returns one SessionInvocationRecord per SDK-level invocation, in
 *   invocation order. Its length always equals getInvocationCount().
 */
export interface HarnessBuildResult {
  runner: AgentRunner;
  getInvocationCount(): number;
  getSessionTrace(): readonly SessionInvocationRecord[];
}

/**
 * Provider harness: translates a LifecycleScenario into a concrete AgentRunner.
 *
 * Each harness:
 * - Constructs the runner using only injectable dependencies (_queryFn / _codexFactory /
 *   _sleepFn / _createMcpServerFn / cwd) — never calls the real SDK loader.
 * - Translates TurnBehavior entries into the provider's native event/throw shapes.
 * - Exposes getInvocationCount() for SDK boundary counting.
 *
 * The id field must match the CONTRACT_PROVIDERS entry for this harness.
 */
export interface ProviderHarness {
  /** Provider identifier matching an entry in CONTRACT_PROVIDERS. */
  id: string;
  /** Build a runner from the given scenario. */
  build(scenario: LifecycleScenario, opts: HarnessBuildOpts): HarnessBuildResult;
}

export type { LifecycleScenario, SessionInvocationKind };
