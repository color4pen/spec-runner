import type { SessionClient } from "./port/session-client.js";
import type { GitHubClient } from "./port/github-client.js";
import type { AgentRunner } from "./port/agent-runner.js";
import type { SpawnFn } from "../util/spawn.js";
import type { SpawnFn as GitExecSpawnFn } from "../util/git-exec.js";
import type { JobStateStore } from "../store/job-state-store.js";
import type { RuntimeStrategy } from "./port/runtime-strategy.js";
import type { ResumeContextSnapshot } from "./resume/resume-context.js";

export type { StepContext } from "./port/step-context.js";
import type { StepContext } from "./port/step-context.js";

/**
 * Factory function that creates a JobStateStore for the given job ID.
 * Injected via PipelineDeps to eliminate inline `new JobStateStore()` calls.
 * Exported so that cancel/finish/resume can adopt the same seam in future requests.
 */
export type StoreFactory = (jobId: string) => JobStateStore;

/**
 * Dependencies injected into all pipeline steps.
 * Defined here (not in pipeline.ts) to break potential circular imports
 * between pipeline.ts ↔ loop.ts ↔ steps/*.ts.
 *
 * Extends StepContext so that PipelineDeps can be passed anywhere StepContext is expected.
 * Design D1 (stepcontext-type-separation): PipelineDeps extends StepContext.
 */
export interface PipelineDeps extends StepContext {
  /**
   * Managed-agent session client. Required for "managed" runtime.
   * Optional when runtime === "local" (ClaudeCodeRunner does not need it).
   * Design D8: composition root injects the appropriate AgentRunner based on runtime config.
   * Note: client is maintained for backward compatibility; after runner is added,
   * pipeline steps use runner directly. client will be removed in a future cleanup request.
   */
  client?: SessionClient;
  /** Injectable sleep for testing */
  sleepFn?: (ms: number) => Promise<void>;
  /** GitHub client (port interface). Required for all pipeline steps. */
  githubClient: GitHubClient;
  /** GitHub repository owner. Required for PR operations. */
  owner: string;
  /** GitHub repository name. Required for PR operations. */
  repo: string;
  /**
   * Pre-built AgentRunner injected by RuntimeStrategy.buildDeps().
   * createStandardPipeline and runProposePipeline use this directly,
   * eliminating the config.runtime branch in pipeline/run.ts.
   * Design D8: runner replaces runtime-specific AgentRunner construction in pipeline.
   */
  runner?: AgentRunner;
  /**
   * Subprocess spawning function. Injected by RuntimeStrategy.buildDeps().
   * CLI steps (verification, pr-create) pass this to subprocess-spawning functions.
   * Design D3 (require-spawn-injection): required to prevent leaky defaults in tests.
   */
  spawn: SpawnFn;
  /**
   * Factory for creating JobStateStore instances. Injected by RuntimeStrategy.buildDeps().
   * Pipeline and executor use this instead of inline `new JobStateStore()`.
   * Design D1 (job-state-store-di): required to prevent leaky defaults in tests.
   */
  storeFactory: StoreFactory;
  /**
   * resume 時にユーザーが注入した追加プロンプト。
   * StepExecutor が最初の agent ステップで消費し undefined にする。
   */
  resumePrompt?: string;
  /**
   * Snapshot captured before resume preparation clears state.resumePoint.
   * StepExecutor uses it to deterministically build automatic resume context.
   */
  resumeContext?: ResumeContextSnapshot;
  /**
   * Absolute path to the git repository root.
   * Used by StepExecutor to compute agent session log paths (debug level).
   * Optional for backward compatibility with existing tests.
   */
  repoRoot?: string;
  /**
   * git-exec.ts SpawnFn wrapped with transport auth (extraheader injection).
   * Injected by LocalRuntime.buildDeps() for StepExecutor commit/push operations.
   * Optional for backward compatibility with existing tests that don't inject it.
   */
  gitTransportSpawn?: GitExecSpawnFn;
  /**
   * Runtime strategy for step artifact lifecycle delegation (B-8 seam).
   * Injected by RuntimeStrategy.buildDeps() so executor stays runtime-agnostic.
   * Optional for backward compatibility with existing tests that don't inject it.
   */
  runtimeStrategy?: RuntimeStrategy;
}
