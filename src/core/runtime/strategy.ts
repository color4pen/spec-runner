/**
 * RuntimeStrategy: runtime-neutral abstraction for agent execution infrastructure.
 *
 * Design D1: RuntimeStrategy interface
 * - LocalRuntime: worktree, ClaudeCodeRunner, signal handler
 * - ManagedRuntime: SessionClient, ManagedAgentRunner, no-op workspace
 *
 * All config.runtime branching is confined to createRuntime() factory (factory.ts).
 */
import type { AgentRunner } from "../port/agent-runner.js";
import type { PipelineDeps } from "../types.js";
import type { SpecRunnerConfig } from "../../config/schema.js";
import type { OriginInfo } from "../../git/remote.js";
import type { ParsedRequest } from "../../parser/request-md.js";

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

/**
 * Options for agent query execution.
 */
export interface QueryOptions {
  cwd?: string;
  maxTurns?: number;
  systemPrompt?: string;
  model?: string;
  allowedTools?: string[];
  // Session / dialog options (LocalRuntime only — passed through to SDK Options)
  sessionId?: string;
  continue?: boolean;
  resume?: string;
  includePartialMessages?: boolean;
}

/**
 * Options passed to setupWorkspace().
 * - run path: requestFilePath (new worktree)
 * - resume path: existingWorktreePath (reuse/recreate)
 */
export interface WorkspaceOptions {
  /** Resume: path of the existing worktree to reuse (or null to recreate) */
  existingWorktreePath?: string | null;
  /** Run: path of the request.md file to copy into the new worktree */
  requestFilePath?: string;
  /** Run: pre-computed branch name for the new worktree (local: -b flag; managed: checkout -b) */
  branchName?: string;
  /** Run: request type for branch prefix computation (used by ManagedRuntime if branchName absent) */
  requestType?: string;
  /** Base branch for worktree creation (e.g. "main" or "master"). Defaults to "main" if omitted. */
  baseBranch?: string;
}

/**
 * Resolved workspace after setupWorkspace().
 * cwd is the directory pipeline steps run in.
 * worktreePath is recorded in state (local only).
 */
export interface WorkspaceContext {
  /** Working directory for pipeline execution */
  cwd: string;
  /** Local worktree path (local runtime only; undefined for managed) */
  worktreePath?: string;
  /** Branch name created during setupWorkspace (set when branchName was provided) */
  branch?: string;
}

/**
 * Opaque handle returned by registerCleanup().
 * CommandRunner passes it to teardown() but never inspects its internals.
 * Branded to prevent accidental construction outside of RuntimeStrategy impls.
 */
export type CleanupHandle = { readonly __brand: unique symbol } & Record<string, unknown>;

// ---------------------------------------------------------------------------
// RuntimeStrategy interface
// ---------------------------------------------------------------------------

/**
 * RuntimeStrategy: runtime-neutral shared infrastructure for CommandRunner.
 *
 * Implementations:
 * - LocalRuntime  — local worktree, ClaudeCodeRunner, signal-handler cleanup
 * - ManagedRuntime — SessionClient, ManagedAgentRunner, no-op workspace/cleanup
 */
export interface RuntimeStrategy {
  /**
   * Agent execution primitive (future dialog use).
   * pipeline steps use createAgentRunner() instead.
   */
  query(prompt: string, opts?: QueryOptions): AsyncGenerator<unknown>;

  /**
   * Return an AgentRunner wrapping query() for use in pipeline steps.
   */
  createAgentRunner(): AgentRunner;

  /**
   * Prepare workspace for pipeline execution.
   * - local: create worktree + copy request.md + git add
   * - managed: returns { cwd } unchanged
   */
  setupWorkspace(
    slug: string,
    jobId: string,
    opts?: WorkspaceOptions,
  ): Promise<WorkspaceContext>;

  /**
   * Assemble PipelineDeps for the resolved workspace.
   */
  buildDeps(
    config: SpecRunnerConfig,
    repo: OriginInfo,
    request: ParsedRequest,
    slug: string,
    workspace: WorkspaceContext,
  ): PipelineDeps;

  /**
   * Register cleanup handlers (signal, failure).
   * - local: SIGINT/SIGTERM handler + cleanupWorktreeOnFailure closure
   * - managed: no-op
   */
  registerCleanup(jobId: string, startStep: string): CleanupHandle;

  /**
   * Execute teardown after pipeline completes or fails.
   * - local: deregister signal handlers + cleanup worktree on failure
   * - managed: no-op
   */
  teardown(handle: CleanupHandle, finalStatus: string): Promise<void>;
}
