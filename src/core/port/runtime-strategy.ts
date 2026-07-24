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
import type { ArtifactRef } from "../../state/artifact-types.js";
import type { OutputContract, OutputCheckResult } from "./output-contract.js";

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

/**
 * Port DTO for reading a file's content at the current revision and at a prior commitOid.
 *
 * Used by finding-recency to compare whether a finding's target line existed in the
 * prior spec-review round's revision.
 *
 * - `current`: file content at the worktree/branch HEAD (null if file absent or read fails).
 * - `prior`:   file content at the given priorOid commit (null if OID absent/invalid or
 *              runtime cannot resolve arbitrary OIDs — e.g. managed runtime).
 */
export interface RevisionContentPair {
  current: string | null;
  prior: string | null;
}

/**
 * Port DTO for a single-moment snapshot of guarded main-checkout paths.
 *
 * Built from `git status --porcelain` filtered to monitored globs.
 * hash: sha256:<hex> when the file exists, null when deleted (DELETED sentinel).
 * Domain-neutral — no domain imports. Placed in port layer so step pure modules
 * and both runtimes can import without creating back-edges (same pattern as
 * RequiredInput / FindingRef).
 */
export interface MainCheckoutGuardSnapshot {
  entries: { path: string; hash: string | null }[];
}

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
 * Discriminated union returned by listWorktreeChanges.
 *
 * - success:     git status ran cleanly; paths contains worktree-relative changed files.
 * - unavailable: git status could not be run (non-zero exit, spawn error, etc.);
 *               reason carries exit code or error summary. Never throws — uses DU instead.
 */
export type WorktreeInspectionResult =
  | { kind: "success"; paths: string[] }
  | { kind: "unavailable"; reason: string };

/**
 * Discriminated union returned by listChangedFiles.
 *
 * - success:     git diff ran cleanly; files contains repo-relative changed file paths.
 *               files may be empty — empty means "no changes" (not a failure).
 * - unavailable: derivation failed at call time (non-zero exit, spawn error, etc.);
 *               reason carries exit code or error summary. Never throws — uses DU instead.
 */
export type ChangedFilesResult =
  | { kind: "success"; files: string[] }
  | { kind: "unavailable"; reason: string };

/**
 * Port DTO for isolated per-file test execution results (bite-evidence-forward R4, T-04).
 *
 * - ran:         tests executed; results contains per-file pass/fail.
 * - unavailable: isolated execution could not be performed (spawn error, unsupported command,
 *               non-existent OID, etc.). Never throws — uses DU instead.
 */
export type IsolatedTestResult =
  | { kind: "ran"; results: { file: string; passed: boolean }[] }
  | { kind: "unavailable"; reason: string };

/**
 * Port DTO for a commit-scoped file read result (D5, achieved-assurance-completeness).
 *
 * Used by the archive floor gate to read events.jsonl / test-cases.md at the final
 * archive HEAD OID for scenario two-layer freeze verification (P0-2).
 *
 * - found:       file resolved via trailing-suffix match; content is the raw utf-8 text.
 * - unavailable: file not found, OID non-existent, ambiguous suffix, or structural
 *               limitation (e.g. managed runtime, spawn error). Never throws.
 */
export type CommitFileResult =
  | { kind: "found"; path: string; content: string }
  | { kind: "unavailable"; reason: string };

/**
 * Port DTO for a finding reference to be verified for existence.
 * Used by verifyFindingRefs to check that referenced files/lines actually exist.
 */
export interface FindingRef {
  /** Worktree-relative file path (from a Finding). */
  file: string;
  /** Optional line number (from a Finding). */
  line?: number;
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
  /**
   * When true, skip worktree creation and use cwd as the workspace directory.
   * Intended for CI environments where a feature branch is already checked out.
   */
  noWorktree?: boolean;
  /**
   * Run path only. When true, setupWorkspace checks whether local baseBranch is
   * ahead of origin/<baseBranch> (unpushed commits) and emits a warning if so.
   * resume path must not set this field (ahead detection is run-only).
   */
  designLayerEnabled?: boolean;
  /**
   * Attach path only. When set, setupWorkspace materializes a worktree from the given
   * remote checkpoint ref (feature branch HEAD) instead of the base branch.
   * The checkpoint ref must already be fetched (fetch is orchestrator responsibility).
   * Skips bootstrap seed, updateJobState, and request.md copy — the checkpoint tree
   * already contains these files.
   */
  attachCheckpoint?: {
    /** Feature branch name (local branch to create in the worktree). */
    branch: string;
    /** Fully-qualified git ref to checkout (e.g. "origin/<branch>"). */
    checkpointRef: string;
  };
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
  /**
   * When true, this workspace was resolved in no-worktree mode.
   * The cwd is the repository root itself (no isolated worktree).
   */
  noWorktree?: boolean;
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
   * - managed: persists full state to .specrunner/local/<slug>/ (machine-local, changeDir seam).
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

  /**
   * Validate declared step output contracts after the agent session completes.
   * Called by StepExecutor after runner.run() succeeds, before finalizeStepArtifacts.
   *
   * Contract: NEVER throws — returns an OutputCheckResult with violations.
   * Empty contracts → empty result (fast path).
   *
   * - local:
   *     "produced":       fs.readFile(join(cwd, path)).
   *                       Missing / empty-trim / scaffold byte-match → violation (detail: []).
   *     "tasks-complete": fs.readFile → parseIncompleteTaskLabels non-empty → violation
   *                       (detail contains incomplete task labels).
   * - managed:
   *     Fetches origin/<branch> first (stdout-clean, failure ignored).
   *     "produced":       githubClient.getRawFile(owner, repo, branch, path).
   *                       null / empty-trim / scaffold byte-match → violation (detail: []).
   *     "tasks-complete": getRawFile → parseIncompleteTaskLabels non-empty → violation
   *                       (detail contains incomplete task labels).
   *     branch null → all contracts are treated as violations.
   *
   * D3 (step-io-contracts): post-execution validation seam, symmetric to validateStepInputs.
   */
  validateStepOutputs(
    contracts: OutputContract[],
    cwd: string,
    branch: string | null,
  ): Promise<OutputCheckResult>;

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

  /**
   * Verify that finding references (file + optional line) actually exist.
   *
   * Called after judge step session ends, before verdict is finalized.
   * Only verdict-affecting findings (critical/high/decision-needed) are passed.
   *
   * Contract: returns the subset of refs that do NOT exist (non-existent refs).
   * - Empty input → empty output (no-op).
   * - If a ref's file does not exist → included in returned array.
   * - If a ref has a line number and the file has fewer lines → included in returned array.
   *
   * - local:   `path.join(cwd, file)` filesystem existence + line count check.
   * - managed: `githubClient.getRawFile(owner, repo, branch, file)` null check + line count.
   *            If branch is null → all refs are treated as non-existent.
   */
  verifyFindingRefs(refs: FindingRef[], cwd: string, branch: string | null): Promise<FindingRef[]>;

  /**
   * Compute content hashes for a list of artifact paths (D4, artifact-observability).
   *
   * Called by StepExecutor.finalizeStep after a step succeeds to build a LineageRecord.
   * Returns one ArtifactRef per input ref, preserving path and adding hash.
   *
   * - local:   reads each file, computes sha256 as "sha256:<hex>".
   *            File not found / read error → hash: null (does NOT throw).
   * - managed: no local filesystem available; returns hash: null for every ref.
   *
   * Never throws — callers treat the entire lineage recording as best-effort.
   */
  digestArtifacts(refs: { path: string }[], cwd: string, branch: string | null): Promise<ArtifactRef[]>;

  /**
   * List files changed between baseBranch and the current HEAD (or the given branch).
   *
   * Used by the reviewer activation gate and scope-check to evaluate changed files.
   *
   * Contract:
   * - Never throws — returns a ChangedFilesResult discriminated union instead.
   * - success: derivation succeeded; files contains repo-relative changed paths
   *   (e.g. "src/auth/login.ts"). files may be empty — empty means "no changes".
   * - unavailable: derivation failed at call time (non-zero exit, spawn error, etc.);
   *   reason carries exit code or error summary.
   *
   * - local:   `git diff --name-only <baseBranch>...HEAD` executed in cwd.
   *            exit 0 → success (files may be empty); non-zero exit / spawn error → unavailable.
   * - managed: always returns unavailable (no local worktree; structural limitation).
   *
   * @param baseBranch - Base branch name (e.g. "main").
   * @param cwd        - Working directory for the git command.
   * @param branch     - Current branch (informational; local impl uses HEAD directly).
   */
  listChangedFiles(baseBranch: string, cwd: string, branch: string | null): Promise<ChangedFilesResult>;

  // ---------------------------------------------------------------------------
  // Round-owned git effects (D3, round-owned-git-effects)
  // ---------------------------------------------------------------------------

  /**
   * List files with uncommitted changes in the worktree.
   *
   * Used by ParallelReviewRound after the fan-out completes to detect which files
   * were changed by the round members (who did not commit under roundOwnsGitEffects).
   *
   * Contract:
   * - Never throws — returns a WorktreeInspectionResult discriminated union instead.
   * - success: git status ran cleanly; paths contains worktree-relative changed files
   *   (e.g. "specrunner/changes/foo/spec-result-001.md"), including added, modified,
   *   deleted, and untracked files.
   * - unavailable: git status could not be run (non-zero exit, spawn error, or any
   *   other exception); reason carries exit code or error summary.
   *
   * - local:   `git status --porcelain -z --no-renames` in cwd; exit 0 → success,
   *            non-zero exit / spawn exception → unavailable.
   * - managed: always returns success with empty paths (no local worktree;
   *            known Non-Goal for managed runtime — worktree absence is not a failure).
   *
   * Optional on the port so RuntimeStrategy-typed test fakes may omit it.
   * RealRuntimeStrategy requires it (compile-time enforcement on concrete runtimes).
   *
   * @param cwd - Working directory (the worktree in which to run git status).
   */
  listWorktreeChanges?(cwd: string): Promise<WorktreeInspectionResult>;

  /**
   * Stage only the declared paths and commit+push (scoped staging for coordinator rounds).
   *
   * Called by ParallelReviewRound after partitionRoundChanges when there are declared
   * outputs to stage (toStage non-empty and no offending paths).
   *
   * Contract:
   * - stagePaths empty → no-op.
   * - Uses `git add -A -- <stagePaths...>` (pathspec-limited; never `git add -A`).
   * - Commits only if there are staged changes; no-op otherwise.
   * - Push is one retry on failure (same as finalizeStepArtifacts).
   *
   * Parameters are typed as `unknown` at the port level to keep this file free of
   * ports→domain imports. LocalRuntime declares concrete types (CommitPushInfra).
   *
   * - local:   delegates to commitScopedPaths in commit-push.ts.
   * - managed: no-op (no local worktree; known Non-Goal for managed runtime).
   *
   * Optional on the port so RuntimeStrategy-typed test fakes may omit it.
   * RealRuntimeStrategy requires it (compile-time enforcement on concrete runtimes).
   *
   * @param stagePaths     - Declared outputs to stage (from partitionRoundChanges.toStage).
   * @param cwd            - Working directory (the worktree).
   * @param branch         - Branch to push to.
   * @param coordinatorName - Name of the coordinator step (used in commit message + event).
   * @param slug           - Job slug (used in commit message).
   * @param commitPushInfra - Infrastructure for commit/push (typed unknown at port level).
   */
  commitRoundArtifacts?(
    stagePaths: string[],
    cwd: string,
    branch: string,
    coordinatorName: string,
    slug: string,
    commitPushInfra: unknown,
    /** D4 egress backstop params (typed unknown at port level). LocalRuntime casts to concrete type. */
    egressParams?: unknown,
  ): Promise<void>;

  /**
   * Seam meta-information: whether this runtime can structurally derive changed files.
   *
   * Consumed by scope-check and the reviewer activation gate as fail-closed short-circuits
   * for runtimes that structurally cannot derive changed files (e.g. managed, no worktree):
   *   - scope-check: `false` → synthesize an UNKNOWN finding instead of calling listChangedFiles.
   *   - Reviewer activation gate: `false` → activate `paths`-conditioned reviewers
   *     (fail-closed) without calling listChangedFiles.
   *
   * This predicate covers **structural non-derivability** (e.g. managed runtime has no
   * local git worktree at all). Per-call derivation failures (non-zero exit, spawn error)
   * on an otherwise capable runtime are expressed via the `unavailable` arm of the
   * ChangedFilesResult DU returned by listChangedFiles, which consumers handle the same
   * way as predicate=false (fail-closed routing). The two mechanisms are complementary:
   * canDeriveChangedFiles short-circuits before the call; DU unavailable handles call-time
   * failures on an otherwise capable runtime.
   *
   * - `true`  — runtime can derive changed files (e.g. LocalRuntime with git worktree).
   * - `false` — runtime cannot derive changed files (e.g. ManagedRuntime, no local worktree).
   * - absent  — treated as derivable: the listChangedFiles path is used, and
   *             fail-closed behavior does NOT fire for runtimes without this predicate.
   *
   * Optional to preserve backward compatibility with test fakes typed as RuntimeStrategy:
   * absent is treated as "evaluate via listChangedFiles" (not as "cannot derive").
   * Only predicate=false triggers the short-circuit in both consumers.
   */
  canDeriveChangedFiles?(): boolean;

  /**
   * Reject a second run while a live job already holds this slug (local runtime only).
   * Called by PipelineRunCommand.prepare() immediately before bootstrapJob so a rejected
   * run creates no job state.
   * - local:   read liveness sidecar; if pid is alive → throw DUPLICATE_LIVE_JOB.
   * - managed: no-op (out of scope for this change).
   * Optional on the port so RuntimeStrategy-typed test fakes may omit it; RealRuntimeStrategy
   * requires it (mirrors canDeriveChangedFiles).
   */
  assertNoDuplicateLiveJob?(repoRoot: string, slug: string): Promise<void>;

  /**
   * Assert that the provider is ready before any side effects (job state / worktree / branch
   * / journal) are created.
   *
   * Called by CommandRunner.execute() at the very top — before prepare() — so a readiness
   * failure surfaces prior to any persistent mutations.
   *
   * - local:   calls the injected ProviderReadinessProbe once; throws a classified
   *            SpecRunnerError("PROVIDER_NOT_READY", ...) when the probe returns a non-ready kind.
   * - managed: no-op (managed readiness / preflight is unchanged by this change).
   *
   * Optional on the port so RuntimeStrategy-typed test fakes may omit it; RealRuntimeStrategy
   * requires it (compile-time enforcement on concrete runtimes — mirrors assertNoDuplicateLiveJob).
   */
  assertProviderReadiness?(env: Record<string, string | undefined>): Promise<void>;

  /**
   * Reload job state from the canonical slug store after setupWorkspace() completes.
   *
   * Called by CommandRunner.execute() immediately after setupWorkspace() succeeds so that
   * all fields written to the store during setup (worktreePath, synthesizedCommits, branch,
   * request.path, etc.) are reflected in the in-memory state passed to the pipeline.
   * Replaces the former manual mirror (worktreePath / branch only) with a single store reload
   * that picks up every field, regardless of which fields setupWorkspace() writes in the future.
   *
   * - local:   constructs a JobStateStore with `workspace.worktreePath ?? cwd` as stateRoot
   *            and calls `.load()`. Returns the loaded state cast as JobState (safe: no step
   *            runs have occurred at this lifecycle point, so steps is always {}).
   * - managed: fail-closed throw (store topology not verified for managed runtime; reload
   *            safety must be confirmed in a separate request — D3 / T-03 choice).
   * - throws on load error (caller is fail-closed: reload failure prevents pipeline start).
   *
   * Optional on the port so RuntimeStrategy-typed test fakes may omit it.
   * RealRuntimeStrategy requires it (compile-time enforcement on concrete runtimes).
   */
  reloadJobState?(
    jobId: string,
    slug: string,
    workspace: WorkspaceContext,
  ): Promise<JobState>;

  // ---------------------------------------------------------------------------
  // Isolated test execution for bite-evidence gate (R4, bite-evidence-forward T-04)
  // ---------------------------------------------------------------------------

  /**
   * List files changed by a specific commit vs its first parent.
   *
   * Used by the bite-evidence gate to identify the materialized test files from
   * the test-materialize commit.
   *
   * Contract:
   * - Never throws — returns a ChangedFilesResult discriminated union instead.
   * - success: git diff ran; files contains repo-relative paths changed by `oid`.
   * - unavailable: git command failed or `oid` is non-existent (non-zero exit, spawn error).
   *
   * - local:   `git diff --name-only <oid>^ <oid>` executed in cwd.
   * - managed: always returns unavailable (no local worktree; structural limitation).
   *
   * Optional on the port so RuntimeStrategy-typed test fakes may omit it.
   * RealRuntimeStrategy requires it (compile-time enforcement on concrete runtimes).
   */
  listCommitChangedFiles?(oid: string, cwd: string): Promise<ChangedFilesResult>;

  /**
   * List files changed between two arbitrary commit OIDs, filtered to the given paths.
   *
   * Used by the archive floor gate (assurance-provenance-floor) to verify that
   * materialized test files are byte-identical between the test-materialize base commit
   * and the final archive HEAD commit (freeze check / tamper detection).
   *
   * Contract:
   * - Never throws — returns a ChangedFilesResult discriminated union instead.
   * - success{files}: git diff ran; files contains the subset of `paths` that differ
   *   between `baseOid` and `headOid` (empty = all paths are frozen/intact).
   * - unavailable{reason}: git command failed, either OID is non-existent, or
   *   the runtime cannot perform a local git diff (e.g. managed runtime).
   * - paths empty array → short-circuit: returns {kind:"success", files:[]} immediately
   *   without invoking git.
   *
   * - local:   `git diff --name-only <baseOid> <headOid> -- <paths...>` executed in cwd.
   *            exit 0 → success (files may be empty); non-zero exit / spawn error → unavailable.
   * - managed: always returns unavailable (no local worktree; structural limitation).
   *
   * Optional on the port so RuntimeStrategy-typed test fakes may omit it.
   * RealRuntimeStrategy requires it (compile-time enforcement on concrete runtimes).
   */
  diffPathsBetweenCommits?(baseOid: string, headOid: string, paths: string[], cwd: string): Promise<ChangedFilesResult>;

  /**
   * Run only the provided test files against the worktree at a specific commit OID
   * using an isolated detached worktree.
   *
   * Used by the bite-evidence gate to verify base-red / candidate-green for each
   * materialized test file.
   *
   * Contract:
   * - Never throws — returns an IsolatedTestResult discriminated union instead.
   * - ran: tests executed; results contains per-file pass/fail (true=passed, false=failed).
   * - unavailable: isolated execution could not be performed (spawn error, non-existent OID,
   *   unsupported command, etc.).
   * - Cleans up the isolated worktree in a finally-style block (even when tests fail).
   * - MUST NOT run the full suite — returns unavailable if the resolved command cannot be
   *   scoped to the provided testFiles.
   *
   * - local:   `git worktree add --detach <tmp> <oid>` → run only testFiles → remove worktree.
   * - managed: always returns unavailable (no local worktree; structural limitation).
   *
   * Optional on the port so RuntimeStrategy-typed test fakes may omit it.
   * RealRuntimeStrategy requires it (compile-time enforcement on concrete runtimes).
   */
  runTestsAtCommit?(
    oid: string,
    testFiles: string[],
    cwd: string,
    config: SpecRunnerConfig,
  ): Promise<IsolatedTestResult>;

  /**
   * Read a file from a specific commit OID by trailing-suffix path resolution.
   *
   * Used by the archive floor gate (achieved-assurance-completeness P0-2) to read
   * events.jsonl and test-cases.md at the final archive HEAD for scenario two-layer
   * freeze verification.
   *
   * Algorithm:
   *   1. `git ls-tree -r --name-only <oid>` (exit non-0 → unavailable).
   *   2. Filter entries by: `entry.endsWith("/" + pathSuffix) || entry.endsWith("-" + pathSuffix)`.
   *   3. 0 entries → unavailable (not found). ≥2 entries → unavailable (ambiguous).
   *   4. `git show <oid>:<resolvedPath>` → content (exit non-0 → unavailable).
   *   5. Return `{ kind:"found", path: resolvedPath, content }`.
   *
   * Contract:
   * - Never throws — returns unavailable on any failure.
   * - 0 or ≥2 suffix matches → unavailable (fail-closed; ambiguity not tolerated).
   * - Non-existent OID / non-existent path → unavailable.
   * - Managed runtime: always unavailable (no local worktree).
   *
   * Optional on the port so RuntimeStrategy-typed test fakes may omit it.
   * RealRuntimeStrategy requires it (compile-time enforcement on concrete runtimes).
   */
  readFileAtCommit?(oid: string, pathSuffix: string, cwd: string): Promise<CommitFileResult>;

  /**
   * Snapshot the state of guarded main-checkout paths at a moment in time.
   *
   * Used by StepExecutor to compare before/after an agent step and detect
   * escape-writes to main checkout guarded paths (forbiddenSurfaces + .specrunner/).
   *
   * Contract:
   * - Never throws — returns null on any git/fs error (fail-open backstop, D6).
   * - no-worktree mode: detectSpecrunnerWorktree returns false → null.
   * - managed runtime: null (no local worktree).
   * - Git status ignores are naturally excluded (git status --porcelain omits them).
   *
   * Optional on the port so RuntimeStrategy-typed test fakes remain unaffected.
   * RealRuntimeStrategy requires the implementation (compile-time enforcement).
   */
  snapshotMainCheckoutGuard?(cwd: string, config: SpecRunnerConfig): Promise<MainCheckoutGuardSnapshot | null>;

  /**
   * Read a file's content at the current worktree revision and at a specific prior commitOid.
   *
   * Used by finding-recency to classify whether a judge finding's target line existed
   * in the previous spec-review round's revision ("late") or is genuinely new ("not-late").
   *
   * Contract:
   * - Never throws — returns null for any field that cannot be resolved.
   * - `current`: read from `path.join(cwd, file)` (local) or `getRawFile(branch, file)` (managed).
   *   Returns null if the file does not exist or a read error occurs.
   * - `prior`: resolved via `git show <priorOid>:<file>` (local) or always null (managed,
   *   because arbitrary OID resolution is not supported in the managed runtime).
   *   Returns null if the OID does not exist, spawn fails, or any error occurs.
   *
   * - local:   reads current file from fs; prior via `git show <priorOid>:<file>` in cwd.
   * - managed: current via `githubClient.getRawFile(branch, file)` (branch null → null);
   *            prior is always null (cannot resolve arbitrary OIDs).
   *
   * Optional on the port so RuntimeStrategy-typed test fakes may omit it.
   * RealRuntimeStrategy requires it (compile-time enforcement on concrete runtimes).
   */
  readRevisionContent?(
    file: string,
    priorOid: string,
    cwd: string,
    branch: string | null,
  ): Promise<RevisionContentPair>;
}

// ---------------------------------------------------------------------------
// RealRuntimeStrategy — intersection type for concrete runtime implementations
// ---------------------------------------------------------------------------

/**
 * Intersection type that concrete runtime classes in src/core/runtime/ must implement.
 *
 * Extends RuntimeStrategy with a required (non-optional) canDeriveChangedFiles().
 * Using this type for LocalRuntime and ManagedRuntime ensures that:
 * - predicate implementation is enforced at compile time for real runtimes.
 * - test fakes typed as RuntimeStrategy remain unaffected (optional predicate).
 * - a future concrete runtime that omits canDeriveChangedFiles() fails to compile.
 *
 * Port interface (RuntimeStrategy) keeps predicate optional for test-fake convenience.
 * Composition-root implementations use RealRuntimeStrategy to close the optional hole.
 */
export type RealRuntimeStrategy = RuntimeStrategy & {
  canDeriveChangedFiles(): boolean;
  assertNoDuplicateLiveJob(repoRoot: string, slug: string): Promise<void>;
  assertProviderReadiness(env: Record<string, string | undefined>): Promise<void>;
  reloadJobState(jobId: string, slug: string, workspace: WorkspaceContext): Promise<JobState>;
  snapshotMainCheckoutGuard(cwd: string, config: SpecRunnerConfig): Promise<MainCheckoutGuardSnapshot | null>;
  listWorktreeChanges(cwd: string): Promise<WorktreeInspectionResult>;
  commitRoundArtifacts(
    stagePaths: string[],
    cwd: string,
    branch: string,
    coordinatorName: string,
    slug: string,
    commitPushInfra: unknown,
    egressParams?: unknown,
  ): Promise<void>;
  listCommitChangedFiles(oid: string, cwd: string): Promise<ChangedFilesResult>;
  diffPathsBetweenCommits(baseOid: string, headOid: string, paths: string[], cwd: string): Promise<ChangedFilesResult>;
  runTestsAtCommit(
    oid: string,
    testFiles: string[],
    cwd: string,
    config: SpecRunnerConfig,
  ): Promise<IsolatedTestResult>;
  readFileAtCommit(oid: string, pathSuffix: string, cwd: string): Promise<CommitFileResult>;
  readRevisionContent(
    file: string,
    priorOid: string,
    cwd: string,
    branch: string | null,
  ): Promise<RevisionContentPair>;
};
