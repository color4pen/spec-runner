/**
 * RuntimeStrategy: runtime-neutral abstraction for agent execution infrastructure.
 *
 * Design D1: RuntimeStrategy interface
 * - LocalRuntime: worktree, ClaudeCodeRunner, signal handler
 * - ManagedRuntime: SessionClient, ManagedAgentRunner, no-op workspace
 *
 * All config.runtime branching is confined to createRuntime() factory (factory.ts).
 *
 * Moved from core/runtime/strategy.ts to core/port/runtime-strategy.ts to satisfy
 * the §3 DSM closure rule: domain → composition-root is ✗, domain → ports is ✓.
 *
 * Domain-typed parameters (PipelineDeps, AgentStep, CommitPushInfra) are declared as
 * `unknown` here to keep this ports file free of domain→ports back-edges. Callers in
 * domain layers use the concrete types; TypeScript's bivariant method checking allows
 * implementations in core/runtime/ to declare the concrete types.
 */
import type { AgentRunner } from "./agent-runner.js";
import type { SpecRunnerConfig } from "../../config/schema.js";
import type { ParsedRequest } from "../../parser/request-md.js";
import type { JobState, RequestInfo, RepositoryInfo } from "../../state/schema.js";

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

/**
 * Port DTO for a required step input to be validated before step execution.
 * Domain-neutral — only the resolved path and artifact type.
 * Derived from step.reads() by filtering required !== false entries.
 *
 * D3 (step-io-contracts): executor projects IoRef[] → RequiredInput[] for strategy.
 */
export interface RequiredInput {
  /** Worktree-relative path to the required artifact. */
  path: string;
  /** Artifact type: "file" (filesystem) or "gitState" (git branch/repo validity). */
  artifact: "file" | "gitState";
}

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
  /**
   * Initial state to seed into the new worktree's slug store immediately after creation.
   * Provided by PipelineRunCommand (run path) and ResumeCommand (recreate/null path).
   * LocalRuntime uses this to defer initial persistence from bootstrapJob() to setupWorkspace().
   * If absent, seeding is skipped (managed runtime ignores this field).
   */
  bootstrapState?: JobState;
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
 *
 * Note on domain-typed parameters: `buildDeps()` returns `unknown` and
 * `finalizeStepArtifacts()` accepts `unknown` for domain-type parameters (PipelineDeps,
 * AgentStep, CommitPushInfra). This keeps the port layer free of ports→domain imports.
 * Domain-layer callers cast `buildDeps()` results to `PipelineDeps`; implementations
 * in core/runtime/ use concrete types (TypeScript bivariant method checking allows this).
 */
export interface RuntimeStrategy {
  /**
   * Bootstrap a new job: generate jobId + build initial JobState.
   *
   * - local:   pure in-memory; does NOT persist. Persistence is deferred to
   *            setupWorkspace() which seeds the slug store after worktree creation
   *            (bootstrapState in WorkspaceOptions).
   * - managed: pure in-memory; does NOT persist. Seed is deferred to setupWorkspace()
   *            run path (bootstrapState in WorkspaceOptions) into
   *            .specrunner/local/<slug>/ — after the slug is authoritatively known.
   *
   * Returns the initial JobState (jobId already set, status=running, step=init).
   */
  bootstrapJob(
    repoRoot: string,
    params: { request: RequestInfo; repository: RepositoryInfo; pipelineId?: string },
  ): Promise<JobState>;

  /**
   * Persist a terminal or transitional job state to the canonical store.
   *
   * - local:   resolves the slug store (workspace.worktreePath → sidecar → canonicalStateDir).
   *            Persists portable state to slug store. Skips (best-effort) if no store found.
   *            Does NOT write to .specrunner/jobs/<jobId>/.
   * - managed: persists full state to .specrunner/local/<slug>/ (machine-local, changeDir seam).
   *            Does NOT write to .specrunner/jobs/<jobId>/.
   *
   * workspace may be null when the worktree was never established (WORKSPACE_SETUP_FAILED).
   */
  persistJobState(
    jobId: string,
    slug: string,
    workspace: WorkspaceContext | null,
    state: JobState,
  ): Promise<void>;

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
   * Returns `unknown` at the port level; domain callers cast to `PipelineDeps`.
   * Implementations in core/runtime/ declare the concrete PipelineDeps return type.
   */
  buildDeps(
    config: SpecRunnerConfig,
    request: ParsedRequest,
    slug: string,
    workspace: WorkspaceContext,
  ): unknown;

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

  // ---------------------------------------------------------------------------
  // Step artifact lifecycle (B-8 seam)
  // ---------------------------------------------------------------------------

  /**
   * Capture the current HEAD SHA before an agent step runs.
   * - local: `git rev-parse HEAD` (returns null on failure)
   * - managed: returns null (no local worktree)
   */
  captureHeadSha(cwd: string): Promise<string | null>;

  /**
   * Place step output templates in the change folder before an agent runs.
   * - local: calls writeOutputTemplates()
   * - managed: no-op
   */
  prepareStepArtifacts(
    cwd: string,
    slug: string,
    stepName: string,
    state: JobState,
  ): Promise<void>;

  /**
   * Clean up B-group reference templates and commit+push after a successful agent run.
   * - local: cleanupOutputTemplates() → commitAndPush()
   * - managed: no-op
   *
   * Parameters `step`, `deps`, and `commitPushInfra` are typed as `unknown` at the port
   * level to avoid ports→domain imports. Implementations in core/runtime/ use concrete
   * types (AgentStep, PipelineDeps, CommitPushInfra). TypeScript bivariant method
   * checking allows this.
   *
   * commitAndPush errors are re-thrown (not caught here); the executor's .catch()
   * block records the error in state and rethrows with attached state.
   */
  finalizeStepArtifacts(
    step: unknown,
    state: JobState,
    deps: unknown,
    headBeforeStep: string | null,
    commitPushInfra: unknown,
  ): Promise<void>;

  /**
   * Validate that all required step inputs exist before executing a step.
   * Called by StepExecutor before runner.run() / step.run() to enforce I/O contracts.
   *
   * - local: "file" → fs.access(path.join(cwd, relPath)); "gitState" → git repo validity check
   * - managed: git fetch origin <branch> then "file" → git cat-file -e <branch>:<relPath>;
   *            "gitState" → git cat-file -e origin/<branch>
   *
   * fetch and cat-file operations must not write to process stdout.
   * Throws SpecRunnerError("STEP_INPUT_MISSING", hint, message) if any required input is absent.
   * hint and message include the missing paths.
   *
   * D3 (step-io-contracts): pre-execution validation seam in RuntimeStrategy.
   */
  validateStepInputs(inputs: RequiredInput[], cwd: string, branch: string | null): Promise<void>;

  // ---------------------------------------------------------------------------
  // Pipeline terminal phase (D5 seam)
  // ---------------------------------------------------------------------------

  /**
   * Commit and push the final pipeline state (running → awaiting-archive) to the feature branch.
   *
   * Called by pipeline.ts immediately after the running → awaiting-archive transition is persisted.
   *
   * - local:   git add -A → commit "finalize: <slug>" → push origin <branch> (1 retry, best-effort)
   * - managed: no-op (cloud agent manages branch state independently)
   *
   * Parameters are typed as `unknown` at the port level to keep this file free of
   * ports→domain imports. LocalRuntime declares concrete types (PipelineDeps, JobState).
   * TypeScript bivariant method checking allows this.
   *
   * Must NOT throw — push failures are warned on stderr and the run continues.
   */
  commitFinalState(deps: unknown, state: unknown): Promise<void>;
}
