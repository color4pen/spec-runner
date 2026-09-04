/**
 * Provider harness interface and shared build options.
 *
 * Import rules:
 *   - No imports from adapter/claude-code, adapter/codex, or provider SDK packages.
 *   - Imports from src/core/port/, src/state/, src/config/ are allowed.
 *   - LifecycleScenario and buildBaseContext are imported from ../scenario.ts.
 */
import type { AgentRunner } from "../../../../../src/core/port/agent-runner.js";
import type { LifecycleScenario } from "../scenario.js";

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
 * Result of ProviderHarness.build().
 * runner: ready-to-use AgentRunner (implements the port contract).
 * getInvocationCount: returns the total number of SDK-level invocations made
 *   (main + follow-up + repair turns, measured at the SDK boundary).
 */
export interface HarnessBuildResult {
  runner: AgentRunner;
  getInvocationCount(): number;
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

export type { LifecycleScenario };
