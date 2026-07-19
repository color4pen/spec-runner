/**
 * LocalRuntime: RuntimeStrategy implementation for local Claude Code SDK execution.
 *
 * Design D2: worktree creation, ClaudeCodeRunner, signal-handler cleanup.
 * All config.runtime === "local" logic lives here — not in CLI or pipeline.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { GitHubClient } from "../port/github-client.js";
import type { AgentRunner } from "../port/agent-runner.js";
import type { PipelineDeps } from "../types.js";
import type { SpecRunnerConfig, ShellCommand } from "../../config/schema.js";
import type { ParsedRequest } from "../../parser/request-md.js";
import type { JobState } from "../../state/schema.js";
import { toStepName } from "../step/step-names.js";
import { createClaudeCodeRunner, defaultQueryFn, type QueryFn } from "../../adapter/claude-code/agent-runner.js";
import { resolveClaudeCodeOAuthToken } from "../credentials/claude-code.js";
import { DispatchingAgentRunner } from "../../adapter/dispatching/agent-runner.js";
import { createWorktreeManager } from "../worktree/manager.js";
import { detectSpecrunnerWorktree } from "../worktree/detection.js";
import { resolveMonitoredGuardGlobs, matchesMonitored } from "../step/main-checkout-guard.js";
import { spawnCommand, noopSpawnBackground } from "../../util/spawn.js";
import { spawnCommand as spawnScopedCommand } from "../verification/commands.js";
import type { SpawnFn, SpawnBackgroundFn } from "../../util/spawn.js";
import { acquirePowerAssertion } from "./power-assertion.js";
import { createTransportAuth } from "../../git/transport-auth.js";
import { defaultSpawnFn } from "../../util/git-exec.js";
import { JobStateStore, buildInitialJobState } from "../../store/job-state-store.js";
import type { RequestInfo, RepositoryInfo } from "../../state/schema.js";
import { transitionJob } from "../../state/lifecycle.js";
import { changeFolderPath, livenessJsonPath } from "../../util/paths.js";
import { resolveCanonicalStateDir } from "../finish/resolve-canonical-state-dir.js";
import {
  copyRulesToChangeFolder,
  copyDraftUsageToChangeFolder,
  recopyDraftToChangeFolder,
  rejectSymlink,
  writeOutputTemplates,
  cleanupOutputTemplates,
} from "../artifact/copy-artifacts.js";
import { commitAndPush, commitFinalState, commitScopedPaths, commitJournalArtifacts } from "../step/commit-push.js";
import type { CommitPushInfra } from "../step/commit-push.js";
import type { AgentStep } from "../step/types.js";
import type { RealRuntimeStrategy, QueryOptions, WorkspaceOptions, WorkspaceContext, CleanupHandle, RequiredInput, FindingRef, MainCheckoutGuardSnapshot, WorktreeInspectionResult } from "../port/runtime-strategy.js";
import type { ArtifactRef } from "../../store/event-journal.js";
import type { OutputContract, OutputCheckResult } from "../port/output-contract.js";
import { parseIncompleteTaskLabels, evaluateContentFormatChecks } from "../step/output-verify.js";
import { evaluateTestCoverage } from "../verification/test-coverage.js";
import { SpecRunnerError, ERROR_CODES, worktreeDirtyError } from "../../errors.js";
import { checkDuplicateLiveJob } from "./duplicate-slug-guard.js";
import { stderrWrite } from "../../logger/stdout.js";
import { markSignalHandlerFired } from "../lifecycle/signal-state.js";
import { logPipelineDiag } from "../lifecycle/diagnostic.js";
import { stripSecrets } from "../../util/env-filter.js";
import { resolveWorkspaceSetupPlan } from "../worktree/setup.js";
import type { WorkspaceSetupPlan } from "../worktree/setup.js";
import { hasJsDependencyTraces } from "../../util/detect-pm.js";
import { WorkspaceMaterializer, type MaterializerHost } from "./workspace-materializer.js";
import type { WorktreeMaterializationPlan } from "./workspace-materializer.js";
import { JournalAnchorHolder, computeJournalDigest, evaluateAnchorPresence } from "../../store/journal-anchor.js";
import { pipelineManagedPaths } from "../pipeline/round-git-scope.js";
import { atomicWriteString } from "../../util/atomic-write.js";
import { pushEvidenceAnchor } from "../../git/evidence-anchor-ref.js";
import { slugStateJsonPath, slugEventsPath } from "../../util/paths.js";

// Internal structure stored inside CleanupHandle
interface LocalCleanupInternals {
  jobId: string;
  cwd: string;
  worktreePath: string | null;
  startStep: string;
  signalCleanup: () => Promise<void>;
  cleanupWorktreeOnFailure: () => Promise<void>;
  releasePowerAssertion: () => void;
}

function makeHandle(internals: LocalCleanupInternals): CleanupHandle {
  return internals as unknown as CleanupHandle;
}

function getInternals(handle: CleanupHandle): LocalCleanupInternals {
  return handle as unknown as LocalCleanupInternals;
}

export interface LocalRuntimeOptions {
  cwd: string;
  githubClient: GitHubClient;
  githubToken?: string;
  /** GitHub repository owner (e.g. "octocat"). */
  owner?: string;
  /** GitHub repository name (e.g. "my-repo"). */
  repo?: string;
  manager?: ReturnType<typeof createWorktreeManager>;
  spawnFn?: SpawnFn;
  queryFn?: QueryFn;
  /**
   * Workspace setup commands from config.workspace.setup.
   * When set, these commands are run after git worktree add instead of the default detectPm + install.
   * When absent, JS dependency trace detection determines whether install runs.
   */
  workspaceSetup?: ShellCommand[];
  /** Background spawn function for dependency injection (power assertion, tests). */
  spawnBackgroundFn?: SpawnBackgroundFn;
  /** Platform override for dependency injection (power assertion, tests). */
  platform?: NodeJS.Platform;
  /**
   * In-process journal anchor holder (T-03/T-05/T-06).
   * When provided, the holder is updated during journal mutations and used for
   * per-node authorship verification and durable anchor push at checkpoint.
   */
  journalAnchor?: JournalAnchorHolder;
}

export class LocalRuntime implements RealRuntimeStrategy, MaterializerHost {
  readonly cwd: string;
  private readonly githubClient: GitHubClient;
  private readonly githubToken: string;
  private readonly owner: string;
  private readonly repo: string;
  readonly manager: ReturnType<typeof createWorktreeManager>;
  readonly spawnFn: SpawnFn;
  private readonly queryFn: QueryFn;
  private readonly transportAuth: ReturnType<typeof createTransportAuth>;
  /** util/spawn.ts SpawnFn wrapped with transport auth injection. */
  private readonly wrappedSpawnFn: SpawnFn;
  /** Workspace setup commands from config.workspace.setup. undefined = use default detectPm logic. */
  private readonly workspaceSetup: ShellCommand[] | undefined;
  /** Background spawn function for power assertion (injectable for tests). */
  private readonly spawnBackgroundFn: SpawnBackgroundFn;
  /** Platform for power assertion (injectable for tests). */
  private readonly platform: NodeJS.Platform;

  /** WorkspaceMaterializer delegated to for worktree create/registration/liveness (T-03). */
  private readonly materializer: WorkspaceMaterializer;

  /**
   * In-process journal anchor holder (T-03/T-05/T-06).
   * Tracks the exact bytes the pipeline writes to events.jsonl + state.json.
   * Undefined when no journalAnchor option was provided.
   */
  private readonly journalAnchor: JournalAnchorHolder | undefined;

  // Set by setupWorkspace(); used by buildDeps() and registerCleanup()
  private workspace: WorkspaceContext | null = null;
  // Set by setupWorkspace(); slug for slug-based store in buildDeps() / registerCleanup()
  private currentSlug: string | null = null;

  constructor(opts: LocalRuntimeOptions) {
    this.cwd = opts.cwd;
    this.githubClient = opts.githubClient;
    this.githubToken = opts.githubToken ?? "";
    this.owner = opts.owner ?? "";
    this.repo = opts.repo ?? "";
    this.manager = opts.manager ?? createWorktreeManager();
    this.spawnFn = opts.spawnFn ?? spawnCommand;
    this.queryFn = opts.queryFn ?? defaultQueryFn;
    this.transportAuth = createTransportAuth({ token: this.githubToken, cwd: opts.cwd });
    this.wrappedSpawnFn = this.transportAuth.wrapSpawn(this.spawnFn);
    this.workspaceSetup = opts.workspaceSetup;
    // Default to a no-op so constructing a LocalRuntime never spawns a real
    // background process (e.g. in tests). The real spawnBackground is injected
    // at the composition root (createRuntime) for production job execution.
    this.spawnBackgroundFn = opts.spawnBackgroundFn ?? noopSpawnBackground;
    this.platform = opts.platform ?? process.platform;
    this.journalAnchor = opts.journalAnchor;
    this.materializer = new WorkspaceMaterializer(this);
  }

  /**
   * Resolve the workspace setup plan from config and JS dependency traces in the repo root.
   * Called once before each worktree creation.
   */
  resolveSetupPlan(): WorkspaceSetupPlan {
    return resolveWorkspaceSetupPlan(this.workspaceSetup, hasJsDependencyTraces(this.cwd));
  }

  /**
   * Update job state: load from slug store → mutate → persist to slug store.
   *
   * Slug-only strategy (T-02): no longer writes to jobId-based store.
   * All callers must explicitly pass slugOpts; the slug store must exist (seeded by
   * setupWorkspace before the first updateJobState call).
   */
  async updateJobState(
    jobId: string,
    mutator: (s: JobState) => JobState,
    slugOpts: { slug: string; stateRoot: string },
  ): Promise<void> {
    const slugStore = new JobStateStore(jobId, this.cwd, slugOpts);
    const current = (await slugStore.load()) as JobState;
    const updated = mutator(current);
    await slugStore.persist(updated);
  }

  /**
   * Register the resolved workspace as the active workspace context (MaterializerHost seam).
   * Called by WorkspaceMaterializer before updateJobState so slugStoreOpts() can resolve.
   */
  registerWorkspace(workspace: WorkspaceContext): void {
    this.workspace = workspace;
  }

  /** Build slug-based store opts if workspace and slug are available. */
  private slugStoreOpts(): { slug: string; stateRoot: string } | undefined {
    const stateRoot = this.workspace?.worktreePath ?? this.workspace?.cwd;
    if (this.currentSlug && stateRoot) {
      return { slug: this.currentSlug, stateRoot };
    }
    return undefined;
  }

  /**
   * Bootstrap a new job: build initial JobState in-memory without any I/O.
   * Persistence is deferred to setupWorkspace() which seeds the slug store after worktree creation.
   */
  async bootstrapJob(
    _repoRoot: string,
    params: { request: RequestInfo; repository: RepositoryInfo; pipelineId?: string },
  ): Promise<JobState> {
    return buildInitialJobState(params);
  }

  /**
   * Persist a job state to the slug store (portable).
   *
   * Resolution order for slug store:
   *   1. workspace.worktreePath (active worktree)
   *   2. sidecar liveness.json worktreePath (verify real)
   *   3. resolveCanonicalStateDir (archive / main-checkout)
   *
   * If no accessible store is found, persist is skipped (best-effort).
   */
  async persistJobState(
    jobId: string,
    slug: string,
    workspace: WorkspaceContext | null,
    state: JobState,
  ): Promise<void> {
    let stateRoot: string | null = workspace?.worktreePath ?? null;

    if (!stateRoot) {
      // Try sidecar liveness.json for worktreePath
      try {
        const sidecarAbsPath = path.join(this.cwd, livenessJsonPath(slug));
        const raw = await fs.readFile(sidecarAbsPath, "utf-8");
        const sidecar = JSON.parse(raw) as Record<string, unknown>;
        if (typeof sidecar["worktreePath"] === "string" && sidecar["jobId"] === jobId) {
          const wtp = sidecar["worktreePath"] as string;
          try {
            await fs.access(wtp);
            stateRoot = wtp;
          } catch {
            // Worktree not accessible — fall through
          }
        }
      } catch {
        // No sidecar — fall through
      }
    }

    if (stateRoot) {
      const slugStore = new JobStateStore(jobId, this.cwd, { slug, stateRoot });
      await slugStore.persist(state);
      return;
    }

    // Try canonicalStateDir (archive / main-checkout)
    try {
      const canonDir = await resolveCanonicalStateDir(slug, this.cwd);
      if (canonDir) {
        const slugStore = new JobStateStore(jobId, this.cwd, { slug, stateRoot: this.cwd, changeDir: canonDir });
        await slugStore.persist(state);
        return;
      }
    } catch {
      // best-effort
    }

    // No accessible slug store — skip (best-effort)
  }

  /**
   * Build SDK options from QueryOptions, conditionally including session fields.
   * Shared by query() and queryInteractive().
   */
  private buildSdkOptions(opts?: QueryOptions): Record<string, unknown> {
    const options: Record<string, unknown> = {
      cwd: opts?.cwd ?? this.cwd,
      allowedTools: opts?.allowedTools ?? ["Read", "Grep", "Glob"],
      permissionMode: "bypassPermissions",
      model: opts?.model,
      systemPrompt: opts?.systemPrompt,
      env: stripSecrets(process.env as Record<string, string | undefined>),
    };
    // Session / dialog passthrough — only include fields that are explicitly set
    if (opts?.sessionId !== undefined) options["sessionId"] = opts.sessionId;
    if (opts?.continue !== undefined) options["continue"] = opts.continue;
    if (opts?.resume !== undefined) options["resume"] = opts.resume;
    if (opts?.includePartialMessages !== undefined) options["includePartialMessages"] = opts.includePartialMessages;
    return options;
  }

  /**
   * Query the LLM with a prompt and yield result messages.
   * Uses sdkQuery (or injected queryFn for tests) with read-only tools by default.
   */
  async *query(prompt: string, opts?: QueryOptions): AsyncGenerator<unknown> {
    const messages = this.queryFn({
      prompt,
      options: this.buildSdkOptions(opts),
    });

    for await (const message of messages) {
      yield message;
    }
  }

  createAgentRunner(): AgentRunner {
    const worktreeCwd = this.workspace?.cwd ?? this.cwd;
    const claudeRunner = createClaudeCodeRunner({
      cwd: worktreeCwd,
      _queryFn: this.queryFn,
      _resolveClaudeCodeOAuthTokenFn: resolveClaudeCodeOAuthToken,
    });
    return new DispatchingAgentRunner(claudeRunner);
  }

  /**
   * No-worktree setup: use cwd as-is, optionally create feature branch.
   * - Requires clean working tree (git status --porcelain empty).
   * - run path (existingWorktreePath === undefined): git checkout -b <branchName>
   * - resume path (existingWorktreePath set): assume branch already checked out.
   */
  private async setupWorkspaceNoWorktree(
    slug: string,
    jobId: string,
    opts?: WorkspaceOptions,
  ): Promise<WorkspaceContext> {
    // Clean working tree check
    const statusResult = await this.spawnFn("git", ["status", "--porcelain"], { cwd: this.cwd });
    if (statusResult.exitCode !== 0) {
      throw new Error(`git status failed (exit ${statusResult.exitCode}): ${statusResult.stderr.trim()}`);
    }
    const dirtyOutput = statusResult.stdout.trim();
    if (dirtyOutput.length > 0) {
      throw worktreeDirtyError(dirtyOutput);
    }

    const isRunPath = opts?.existingWorktreePath === undefined;
    const branchName = opts?.branchName;

    if (isRunPath && branchName) {
      // Create and switch to the feature branch
      const checkoutResult = await this.spawnFn("git", ["checkout", "-b", branchName], { cwd: this.cwd });
      if (checkoutResult.exitCode !== 0) {
        throw new Error(`git checkout -b ${branchName} failed (exit ${checkoutResult.exitCode}): ${checkoutResult.stderr.trim()}`);
      }
    }
    // Resume path: branch already checked out — no branch operation needed.

    const workspace: WorkspaceContext = {
      cwd: this.cwd,
      worktreePath: undefined,
      branch: branchName,
      noWorktree: true,
    };
    this.workspace = workspace;

    // Seed slug store
    const slugOpts = { slug, stateRoot: this.cwd };
    if (opts?.bootstrapState) {
      await new JobStateStore(jobId, this.cwd, slugOpts).persist(opts.bootstrapState);
    }

    // Write liveness sidecar with worktreePath: null
    await this.writeLivenessSidecar(slug, jobId, null);

    // Run path: copy request.md, rules, etc. into cwd (same as worktree path but targeting cwd)
    if (isRunPath && opts?.requestFilePath) {
      const changeFolderRequestPath = path.join(this.cwd, changeFolderPath(slug), "request.md");
      await fs.mkdir(path.dirname(changeFolderRequestPath), { recursive: true });
      await rejectSymlink(opts.requestFilePath);
      await fs.cp(opts.requestFilePath, changeFolderRequestPath);

      // Stage the change folder request.md
      const gitAddChangeFolderResult = await this.spawnFn(
        "git",
        ["add", path.join(changeFolderPath(slug), "request.md")],
        { cwd: this.cwd },
      );
      if (gitAddChangeFolderResult.exitCode !== 0) {
        throw new Error(`Failed to stage change folder request.md: ${gitAddChangeFolderResult.stderr.trim()}`);
      }

      // Copy draft's usage.json (silent no-op if absent)
      await copyDraftUsageToChangeFolder(opts.requestFilePath, this.cwd, slug, this.spawnFn);

      // Copy rules.md into change folder
      await copyRulesToChangeFolder(this.cwd, slug, this.spawnFn);

      // Update state.request.path
      await this.updateJobState(jobId, (s) => ({
        ...s,
        request: { ...s.request, path: changeFolderRequestPath },
      }), slugOpts);

      // Commit change folder files as the first commit on the feature branch
      const gitCommitResult = await this.spawnFn(
        "git",
        ["commit", "-m", `add request.md for ${slug}`],
        { cwd: this.cwd },
      );
      if (gitCommitResult.exitCode !== 0) {
        throw new Error(`Failed to commit request file: ${gitCommitResult.stderr.trim()}`);
      }
    }

    // Resume path: recopy draft request.md into change folder (copy semantics)
    if (!isRunPath) {
      await recopyDraftToChangeFolder(this.cwd, workspace.cwd, slug, this.spawnFn);
    }

    // Record branchName in state
    if (branchName) {
      await this.updateJobState(jobId, (s) => ({ ...s, branch: branchName }), slugOpts);
    }

    return workspace;
  }

  async setupWorkspace(
    slug: string,
    jobId: string,
    opts?: WorkspaceOptions,
  ): Promise<WorkspaceContext> {
    this.currentSlug = slug;

    // Pre-warm transport auth cache so git-exec spawn wrapper has synchronously-accessible
    // auth args before any StepExecutor push calls. Best-effort: suppressed on failure.
    await this.transportAuth.authArgs().catch(() => {});

    // Attach path: materialize from a remote checkpoint ref (fetch already done by orchestrator)
    if (opts?.attachCheckpoint) {
      const plan = {
        kind: "attach-from-checkpoint",
        checkpointRef: opts.attachCheckpoint.checkpointRef,
        branchName: opts.attachCheckpoint.branch,
      } as const;
      return this.materializeWorktree(slug, jobId, plan, opts);
    }

    const baseBranch = opts?.baseBranch ?? "main";
    const remoteBaseRef = `origin/${baseBranch}`;
    const existingWorktreePath = opts?.existingWorktreePath;

    // Determine the materialization plan for this workspace setup invocation.
    let plan: WorktreeMaterializationPlan;

    if (opts?.noWorktree) {
      plan = { kind: "no-worktree" };
    } else if (existingWorktreePath !== undefined && existingWorktreePath !== null) {
      // Resume path: check if existing worktree is still on disk.
      let worktreeExists = false;
      try {
        await fs.access(existingWorktreePath);
        worktreeExists = true;
      } catch {
        worktreeExists = false;
      }
      if (worktreeExists) {
        plan = { kind: "resume-existing", worktreePath: existingWorktreePath };
      } else {
        plan = { kind: "resume-recreated", remoteBaseRef };
      }
    } else if (existingWorktreePath === null) {
      plan = { kind: "resume-without-recorded-worktree", remoteBaseRef };
    } else {
      // New run: fetch origin to ensure freshness.
      await this.transportAuth.authArgs().catch(() => {});
      const fetchResult = await this.wrappedSpawnFn("git", ["fetch", "origin"], { cwd: this.cwd });
      if (fetchResult.exitCode !== 0) {
        throw new Error(`git fetch origin failed (exit ${fetchResult.exitCode}): ${fetchResult.stderr.trim()}`);
      }

      // Warn if local base branch is behind remote (informational — worktree uses remoteBaseRef so this is safe)
      const behindResult = await this.spawnFn(
        "git",
        ["rev-list", `HEAD..${remoteBaseRef}`, "--count"],
        { cwd: this.cwd },
      );
      if (behindResult.exitCode === 0) {
        const behind = parseInt(behindResult.stdout.trim(), 10);
        if (!isNaN(behind) && behind > 0) {
          stderrWrite(
            `Warning: local ${baseBranch} is ${behind} commit(s) behind ${remoteBaseRef}. Worktree will be created from ${remoteBaseRef}.`,
          );
        }
      }

      // Warn if local base branch is ahead of remote and designLayer is enabled.
      // The job worktree is created from origin/<baseBranch>, so unpushed commits on
      // local <baseBranch> will be absent in the worktree. When designLayer is enabled,
      // request-review resolves design element references ([[id]] / ADR) inside the
      // worktree, and those references may not resolve if the design commits are unpushed.
      if (opts?.designLayerEnabled === true) {
        const aheadResult = await this.spawnFn(
          "git",
          ["rev-list", `${remoteBaseRef}..${baseBranch}`, "--count"],
          { cwd: this.cwd },
        );
        if (aheadResult.exitCode === 0) {
          const ahead = parseInt(aheadResult.stdout.trim(), 10);
          if (!isNaN(ahead) && ahead > 0) {
            stderrWrite(
              `Warning: designLayer is enabled and local ${baseBranch} is ${ahead} commit(s) ahead of ${remoteBaseRef} (unpushed commits).\n` +
              `The job worktree is created from ${remoteBaseRef}, so design elements ([[id]] / ADR) referenced in the request may be missing in the worktree.\n` +
              `Push your design commits before running: git push origin ${baseBranch}`,
            );
          }
        }
      }

      plan = { kind: "new-run", remoteBaseRef, branchName: opts?.branchName };
    }

    return this.materializeWorktree(slug, jobId, plan, opts);
  }

  /**
   * Materialize a worktree according to the given plan.
   * Delegates to WorkspaceMaterializer for all non-no-worktree arms; the
   * materializer owns worktree creation, workspace registration, seed, and liveness.
   */
  private async materializeWorktree(
    slug: string,
    jobId: string,
    plan: WorktreeMaterializationPlan,
    opts?: WorkspaceOptions,
  ): Promise<WorkspaceContext> {
    if (plan.kind === "no-worktree") {
      return this.setupWorkspaceNoWorktree(slug, jobId, opts);
    }
    return this.materializer.materialize(slug, jobId, plan, opts);
  }

  buildDeps(
    config: SpecRunnerConfig,
    request: ParsedRequest,
    slug: string,
    workspace: WorkspaceContext,
  ): PipelineDeps {
    return {
      client: undefined,
      config,
      request,
      slug,
      githubClient: this.githubClient,
      githubToken: this.githubToken,
      owner: this.owner,
      repo: this.repo,
      cwd: workspace.cwd,
      runner: this.createAgentRunner(),
      spawn: this.wrappedSpawnFn,
      storeFactory: (id: string) => {
        const stateRoot = workspace.worktreePath ?? workspace.cwd;
        return new JobStateStore(id, this.cwd, { slug, stateRoot });
      },
      repoRoot: this.cwd,
      runtimeStrategy: this,
      gitTransportSpawn: this.transportAuth.wrapGitExecSpawn(defaultSpawnFn),
    };
  }

  // ---------------------------------------------------------------------------
  // Step artifact lifecycle (B-8 seam)
  // ---------------------------------------------------------------------------

  async captureHeadSha(cwd: string): Promise<string | null> {
    try {
      const result = await this.spawnFn("git", ["rev-parse", "HEAD"], { cwd });
      if (result.exitCode !== 0) return null;
      return result.stdout.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Snapshot the state of guarded main-checkout paths at a moment in time.
   *
   * Workflow:
   *   1. Detect whether cwd is a specrunner worktree; if not, return null (no-worktree / non-worktree skip).
   *   2. Resolve monitored globs from config (forbiddenSurfaces + .specrunner/**).
   *   3. Run `git status --porcelain -z --no-renames` in mainCheckoutPath.
   *   4. Parse output paths, filter by monitored globs.
   *   5. For each matched path: compute sha256 content hash (D4 convention), or null if deleted.
   *
   * Never throws — any error returns null (fail-open backstop, D6).
   * Gitignored files (e.g. .specrunner/local/) are naturally excluded by git status.
   */
  async snapshotMainCheckoutGuard(cwd: string, config: SpecRunnerConfig): Promise<MainCheckoutGuardSnapshot | null> {
    try {
      const detection = await detectSpecrunnerWorktree(cwd);
      if (!detection.isSpecrunnerWorktree || !detection.mainCheckoutPath) return null;

      const mainCheckoutPath = detection.mainCheckoutPath;
      const globs = resolveMonitoredGuardGlobs(config);

      const result = await this.spawnFn(
        "git",
        ["status", "--porcelain", "-z", "--no-renames"],
        { cwd: mainCheckoutPath },
      );
      if (result.exitCode !== 0) return null;

      // Parse NUL-separated entries: each entry is "XY PATH" (3+ chars)
      // -z outputs: XY<SP>PATH<NUL> for each changed file
      const raw = result.stdout;
      const parts = raw.split("\0").filter((p) => p.length > 0);

      const entries: { path: string; hash: string | null }[] = [];
      for (const part of parts) {
        // Format: XY<SP>path  (status 2 chars + space + path)
        if (part.length < 4) continue;
        const xy = part.slice(0, 2);
        const filePath = part.slice(3);

        if (!matchesMonitored(filePath, globs)) continue;

        // Deleted: either staged delete (D in X) or unstaged delete (D in Y)
        const isDeleted = xy[0] === "D" || xy[1] === "D";
        if (isDeleted) {
          entries.push({ path: filePath, hash: null });
        } else {
          const absPath = path.join(mainCheckoutPath, filePath);
          try {
            const content = await fs.readFile(absPath);
            const hex = crypto.createHash("sha256").update(content).digest("hex");
            entries.push({ path: filePath, hash: `sha256:${hex}` });
          } catch {
            // File unreadable — treat as deleted/absent
            entries.push({ path: filePath, hash: null });
          }
        }
      }

      return { entries };
    } catch {
      // Never throw — fail-open backstop
      return null;
    }
  }

  async prepareStepArtifacts(
    cwd: string,
    slug: string,
    stepName: string,
    state: JobState,
  ): Promise<void> {
    await writeOutputTemplates(cwd, slug, stepName, state);
  }

  async finalizeStepArtifacts(
    step: AgentStep,
    state: JobState,
    deps: PipelineDeps,
    headBeforeStep: string | null,
    commitPushInfra: CommitPushInfra,
  ): Promise<void> {
    const cwd = deps.cwd ?? process.cwd();
    await cleanupOutputTemplates(cwd, deps.slug, step.name, state);
    logPipelineDiag("executor:commit:pre", `step=${step.name}`);
    await commitAndPush(step, state, deps, headBeforeStep, commitPushInfra);
    logPipelineDiag("executor:commit:post", `step=${step.name}`);
  }

  /**
   * D5 (remote-checkpoint-publish-attach-closure): commit and push slug canonical state
   * after a terminal pipeline transition.
   *
   * - awaiting-archive: messageLabel = "finalize" (commit "finalize: <slug>").
   * - awaiting-resume: messageLabel = "checkpoint" (commit "checkpoint: <slug>").
   * - git add -A → commit → push origin <branch> (1 retry).
   * - Push failures warn on stderr but do not throw (local resume is preserved).
   */
  async commitFinalState(deps: PipelineDeps, state: JobState): Promise<void> {
    const cwd = deps.cwd ?? process.cwd();
    const branch = state.branch ?? "";
    const slug = deps.slug;
    const messageLabel = state.status === "awaiting-resume" ? "checkpoint" : "finalize";
    await commitFinalState({ cwd, branch, slug, spawnFn: this.wrappedSpawnFn, messageLabel });

    // T-06: push durable evidence anchor to origin after terminal transition.
    // Best-effort — never throws, push failure does not break the terminal transition.
    if (branch && this.journalAnchor) {
      const snap = this.journalAnchor.snapshot();
      if (snap !== null) {
        await pushEvidenceAnchor(this.wrappedSpawnFn, cwd, branch, snap.digest);
      }
    }
  }

  async verifyFindingRefs(refs: FindingRef[], cwd: string, _branch: string | null): Promise<FindingRef[]> {
    if (refs.length === 0) return [];
    const nonExistent: FindingRef[] = [];
    for (const ref of refs) {
      const absPath = path.join(cwd, ref.file);
      let stat: import("node:fs").Stats;
      try {
        stat = await fs.stat(absPath);
      } catch {
        nonExistent.push(ref);
        continue;
      }
      if (stat.isDirectory()) {
        // Directory exists: valid only when no line is specified
        if (ref.line !== undefined) {
          nonExistent.push(ref);
        }
        continue;
      }
      // Regular file: check line bounds if specified
      if (ref.line !== undefined) {
        const content = await fs.readFile(absPath, "utf-8");
        const lineCount = content.split("\n").length;
        if (ref.line > lineCount) {
          nonExistent.push(ref);
        }
      }
    }
    return nonExistent;
  }

  /**
   * List files changed between baseBranch and the current HEAD.
   * Runs `git diff --name-only <baseBranch>...HEAD` in cwd.
   *
   * Never throws — returns a ChangedFilesResult discriminated union instead.
   * - exit 0:         {kind:"success", files} (files may be empty = no changes).
   * - non-zero exit:  {kind:"unavailable", reason} (reason includes exit code).
   * - spawn error:    {kind:"unavailable", reason} (reason includes error message).
   */
  async listChangedFiles(baseBranch: string, cwd: string, _branch: string | null): Promise<import("../port/runtime-strategy.js").ChangedFilesResult> {
    try {
      const result = await this.spawnFn(
        "git",
        ["diff", "--name-only", `${baseBranch}...HEAD`],
        { cwd },
      );
      if (result.exitCode !== 0) {
        return { kind: "unavailable", reason: `git diff exited with code ${result.exitCode}` };
      }
      const files = result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      return { kind: "success", files };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { kind: "unavailable", reason };
    }
  }

  /**
   * LocalRuntime can derive changed files via `git diff --name-only`.
   * Returns true — scope-check may proceed with listChangedFiles for breach evaluation.
   */
  canDeriveChangedFiles(): boolean {
    return true;
  }

  /**
   * List files with uncommitted changes in the worktree.
   *
   * Runs `git status --porcelain -z --no-renames` in cwd and returns worktree-relative
   * paths for all changed entries (added, modified, deleted, untracked).
   * Uses the same NUL-separator parsing as snapshotMainCheckoutGuard.
   *
   * Returns a WorktreeInspectionResult discriminated union.
   * - success: git status ran cleanly; paths contains worktree-relative changed files.
   * - unavailable: git status could not be run (non-zero exit, spawn error, etc.).
   * Never throws — uses DU to express failure instead.
   *
   * D3 (round-owned-git-effects): used by ParallelReviewRound after fan-out to detect
   * uncommitted changes left by round members (who did not commit under roundOwnsGitEffects).
   */
  async listWorktreeChanges(cwd: string): Promise<WorktreeInspectionResult> {
    try {
      const result = await this.spawnFn(
        "git",
        ["status", "--porcelain", "-z", "--no-renames"],
        { cwd },
      );
      if (result.exitCode !== 0) {
        return { kind: "unavailable", reason: `git status exited with code ${result.exitCode}` };
      }

      // Parse NUL-separated entries: each entry is "XY PATH" (3+ chars, status 2 + space + path)
      const raw = result.stdout;
      const parts = raw.split("\0").filter((p) => p.length > 0);
      const paths: string[] = [];

      for (const part of parts) {
        // Format: XY<SP>path (2-char status + space + path)
        if (part.length < 4) continue;
        const filePath = part.slice(3);
        if (filePath) paths.push(filePath);
      }

      return { kind: "success", paths };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { kind: "unavailable", reason };
    }
  }

  /**
   * Stage only the declared paths and commit+push (scoped staging for coordinator rounds).
   *
   * Delegates to commitScopedPaths with a commit message of "<coordinatorName>: <slug>".
   * Stage / commit / push failures are thrown and caught by the pipeline safety net (→ awaiting-resume).
   *
   * D3 (round-owned-git-effects): coordinator round ownership seam.
   */
  async commitRoundArtifacts(
    stagePaths: string[],
    cwd: string,
    branch: string,
    coordinatorName: string,
    slug: string,
    commitPushInfra: unknown,
  ): Promise<void> {
    const infra = commitPushInfra as CommitPushInfra;
    const commitMessage = `${coordinatorName}: ${slug}`;
    await commitScopedPaths(stagePaths, cwd, branch, commitMessage, infra);
  }

  /**
   * T-04 (authorship-separation): commit only the pipeline-managed journal paths
   * (events.jsonl, state.json, usage.json) as a separate commit from agent code.
   * Delegates to commitJournalArtifacts from commit-push.ts.
   */
  async commitJournalArtifacts(cwd: string, branch: string, slug: string, commitPushInfra: unknown): Promise<void> {
    const infra = commitPushInfra as CommitPushInfra;
    await commitJournalArtifacts(cwd, branch, slug, infra);
  }

  /**
   * T-05 (per-node authorship verification): verify that pipeline-managed journal
   * paths were not modified in the agent commit tree, and that the on-disk bytes
   * match the in-process anchor.
   *
   * Two teeth:
   *   1. committed-tree tooth: if headBeforeStep is non-null and HEAD advanced,
   *      diffPathsBetweenCommits checks whether managed paths appear in the diff.
   *   2. on-disk tooth: read events.jsonl + state.json, compute digest, compare
   *      with in-process anchor via evaluateAnchorPresence.
   *
   * Returns:
   *   - { kind: "ok" }    — journal is authentic.
   *   - { kind: "skip" }  — no anchor established, skip verification.
   *   - { kind: "tamper"; detail } — tamper detected.
   */
  async verifyNodeJournalAuthorship(input: {
    headBeforeStep: string | null;
    cwd: string;
    slug: string;
  }): Promise<{ kind: "ok" } | { kind: "skip" } | { kind: "tamper"; detail: string }> {
    const { headBeforeStep, cwd, slug } = input;

    // Committed-tree tooth: skip when headBeforeStep is null (no pre-step snapshot).
    if (headBeforeStep !== null) {
      const headAfterStep = await this.captureHeadSha(cwd);
      if (headAfterStep !== null && headAfterStep !== headBeforeStep) {
        const managed = pipelineManagedPaths(slug);
        const diffResult = await this.diffPathsBetweenCommits(headBeforeStep, headAfterStep, managed, cwd);
        if (diffResult.kind === "success" && diffResult.files.length > 0) {
          return {
            kind: "tamper",
            detail: `pipeline-managed journal paths found in agent commit tree: ${diffResult.files.join(", ")}`,
          };
        }
        // diffResult.kind === "unavailable" → skip this tooth (fail-open, rely on on-disk)
      }
    }

    // On-disk tooth: read events.jsonl + state.json and compare with in-process anchor.
    let onDiskDigest: string | null = null;
    try {
      const eventsPath = path.join(cwd, slugEventsPath(slug));
      const statePath = path.join(cwd, slugStateJsonPath(slug));
      const [eventsBytes, stateBytes] = await Promise.all([
        fs.readFile(eventsPath, "utf-8"),
        fs.readFile(statePath, "utf-8"),
      ]);
      onDiskDigest = computeJournalDigest(eventsBytes, stateBytes);
    } catch {
      // Files absent or unreadable — onDiskDigest stays null
    }

    const inProcess = this.journalAnchor?.snapshot()?.digest ?? null;
    const evaluation = evaluateAnchorPresence({ inProcess, durable: null, onDiskDigest });

    if (evaluation.kind === "skip") {
      return { kind: "skip" };
    }
    if (evaluation.kind === "tamper") {
      return { kind: "tamper", detail: "both anchors absent but on-disk journal exists (unexpected external write)" };
    }
    // evaluation.kind === "use"
    if (evaluation.baseline === onDiskDigest) {
      return { kind: "ok" };
    }
    return {
      kind: "tamper",
      detail: `on-disk journal digest mismatch — expected ${evaluation.baseline}, got ${onDiskDigest ?? "(unreadable)"}`,
    };
  }

  /**
   * T-05 (per-node authorship restoration): write the in-process anchor bytes back
   * to on-disk events.jsonl and state.json. Called after tamper detection before halt.
   *
   * Returns true if restoration was performed, false if no anchor is established.
   */
  async restoreJournalToAnchor(input: { cwd: string; slug: string }): Promise<boolean> {
    const snap = this.journalAnchor?.snapshot();
    if (snap === null || snap === undefined) return false;

    const { cwd, slug } = input;
    const eventsPath = path.join(cwd, slugEventsPath(slug));
    const statePath = path.join(cwd, slugStateJsonPath(slug));

    await Promise.all([
      atomicWriteString(eventsPath, snap.events),
      atomicWriteString(statePath, snap.state),
    ]);
    return true;
  }

  /**
   * Reject a second run while a live job already holds this slug.
   * Delegates to checkDuplicateLiveJob using real fs and isProcessAlive.
   */
  async assertNoDuplicateLiveJob(repoRoot: string, slug: string): Promise<void> {
    await checkDuplicateLiveJob(repoRoot, slug);
  }

  // ---------------------------------------------------------------------------
  // Isolated test execution for bite-evidence gate (R4, bite-evidence-forward T-04)
  // ---------------------------------------------------------------------------

  /**
   * List files changed by a specific commit vs its first parent.
   * Runs `git diff --name-only <oid>^ <oid>` in cwd.
   *
   * Never throws — returns ChangedFilesResult DU instead.
   * - exit 0:         {kind:"success", files}
   * - non-zero exit:  {kind:"unavailable", reason}
   * - spawn error:    {kind:"unavailable", reason}
   */
  async listCommitChangedFiles(oid: string, cwd: string): Promise<import("../port/runtime-strategy.js").ChangedFilesResult> {
    try {
      const result = await this.spawnFn(
        "git",
        ["diff", "--name-only", `${oid}^`, oid],
        { cwd },
      );
      if (result.exitCode !== 0) {
        return { kind: "unavailable", reason: `git diff exited with code ${result.exitCode}` };
      }
      const files = result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      return { kind: "success", files };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { kind: "unavailable", reason };
    }
  }

  /**
   * List files changed between two arbitrary commit OIDs, filtered to the given paths.
   * Runs `git diff --name-only <baseOid> <headOid> -- <paths...>` in cwd.
   *
   * Used by the archive floor gate (assurance-provenance-floor) to verify freeze integrity.
   *
   * Never throws — returns ChangedFilesResult DU instead.
   * - paths empty: short-circuit → {kind:"success", files:[]} (no git call).
   * - exit 0: {kind:"success", files} (empty files = all paths frozen/intact).
   * - non-zero exit / spawn error: {kind:"unavailable", reason}.
   */
  async diffPathsBetweenCommits(baseOid: string, headOid: string, paths: string[], cwd: string): Promise<import("../port/runtime-strategy.js").ChangedFilesResult> {
    // Short-circuit: empty paths → no diff possible, vacuously frozen.
    if (paths.length === 0) {
      return { kind: "success", files: [] };
    }
    try {
      const result = await this.spawnFn(
        "git",
        ["diff", "--name-only", baseOid, headOid, "--", ...paths],
        { cwd },
      );
      if (result.exitCode !== 0) {
        return { kind: "unavailable", reason: `git diff exited with code ${result.exitCode}` };
      }
      const files = result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      return { kind: "success", files };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { kind: "unavailable", reason };
    }
  }

  /**
   * Run only the provided test files against an isolated detached worktree at `oid`.
   *
   * Branch selection (D3 precedence):
   *   - **Scoped path**: `config.verification.scopedTestCommand` is a non-empty string.
   *     Symlinks `<cwd>/node_modules` into the isolated worktree (D1), then runs each
   *     test file individually via `<scopedTestCommand> '<file>'` using the verification
   *     `spawnCommand` (which prepends `<tmpBase>/node_modules/.bin` to PATH).
   *     Returns `unavailable` (fail-closed) if `<cwd>/node_modules` does not exist.
   *   - **Bail path**: custom `verification.commands` are present but `scopedTestCommand`
   *     is not set. Returns `{ kind: "unavailable" }` (backward-compat, opt-in not enabled).
   *   - **Default path**: no custom commands and no `scopedTestCommand`. Runs each file
   *     via `bun test <file>` using `this.spawnFn` with `cwd = tmpBase` (unchanged).
   *
   * Cleanup (D4): the `<tmpBase>/node_modules` symlink is removed first (never followed),
   * then the isolated worktree itself, in the finally block.
   *
   * Never throws — returns IsolatedTestResult DU instead.
   * Returns `unavailable` on any failure (spawn error, non-existent OID, etc.).
   */
  async runTestsAtCommit(
    oid: string,
    testFiles: string[],
    cwd: string,
    config: import("../../config/schema.js").SpecRunnerConfig,
  ): Promise<import("../port/runtime-strategy.js").IsolatedTestResult> {
    if (testFiles.length === 0) {
      return { kind: "ran", results: [] };
    }

    // Create a unique temp directory for the isolated worktree
    const os = await import("node:os");
    const tmpBase = path.join(os.tmpdir(), `specrunner-bite-evidence-${oid.slice(0, 8)}-${Date.now()}`);
    let worktreeCreated = false;
    let symlinkCreated = false;

    try {
      // Create isolated detached worktree at the given OID
      const addResult = await this.spawnFn(
        "git",
        ["worktree", "add", "--detach", tmpBase, oid],
        { cwd },
      );
      if (addResult.exitCode !== 0) {
        return {
          kind: "unavailable",
          reason: `git worktree add failed (exit ${addResult.exitCode}): ${addResult.stderr ?? ""}`,
        };
      }
      worktreeCreated = true;

      // D3 precedence: determine execution branch.
      const scopedTestCommand = config.verification?.scopedTestCommand?.trim();
      const hasCustomCommands =
        config.verification?.commands !== undefined &&
        (config.verification.commands as unknown[]).length > 0;

      if (scopedTestCommand) {
        // ── Scoped path ──────────────────────────────────────────────────────
        // D1: verify <cwd>/node_modules exists (fail-closed if absent).
        const nodeModulesSrc = path.join(cwd, "node_modules");
        try {
          await fs.access(nodeModulesSrc);
        } catch {
          return {
            kind: "unavailable",
            reason: `node_modules not found in cwd (${nodeModulesSrc}); cannot resolve dependencies for isolated execution`,
          };
        }

        // Create symlink: <tmpBase>/node_modules → <cwd>/node_modules
        const nodeModulesLink = path.join(tmpBase, "node_modules");
        await fs.symlink(nodeModulesSrc, nodeModulesLink, "dir");
        symlinkCreated = true;

        // Run each test file individually via the scoped command.
        const results: { file: string; passed: boolean }[] = [];
        for (const testFile of testFiles) {
          try {
            // Single-quote-escape the file path so paths with spaces/special chars
            // cannot mis-split under `sh -c`.
            const escapedFile = testFile.replace(/'/g, "'\\''");
            const shellCmd = `${scopedTestCommand} '${escapedFile}'`;
            const result = await spawnScopedCommand(shellCmd, tmpBase, stripSecrets(process.env as Record<string, string | undefined>));
            results.push({ file: testFile, passed: result.exitCode === 0 });
          } catch {
            // Per-file spawn error → treat as failed
            results.push({ file: testFile, passed: false });
          }
        }
        return { kind: "ran", results };

      } else if (hasCustomCommands) {
        // ── Bail path ────────────────────────────────────────────────────────
        // scopedTestCommand not set + custom commands present → unavailable (opt-in not enabled).
        return {
          kind: "unavailable",
          reason: "custom verification.commands present but no scopedTestCommand configured (scoped isolated execution is opt-in)",
        };

      } else {
        // ── Default path ─────────────────────────────────────────────────────
        // No custom commands, no scopedTestCommand: run each file via `bun test <file>`.
        const results: { file: string; passed: boolean }[] = [];
        for (const testFile of testFiles) {
          try {
            const testResult = await this.spawnFn(
              "bun",
              ["test", testFile],
              { cwd: tmpBase },
            );
            results.push({ file: testFile, passed: testResult.exitCode === 0 });
          } catch {
            // Per-file spawn error → treat as failed
            results.push({ file: testFile, passed: false });
          }
        }
        return { kind: "ran", results };
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { kind: "unavailable", reason };
    } finally {
      // D4: Clean up symlink first (never follows it), then the worktree.
      if (symlinkCreated) {
        try {
          await fs.rm(path.join(tmpBase, "node_modules"), { force: true });
        } catch {
          // Best-effort — failure is non-fatal
        }
      }
      if (worktreeCreated) {
        try {
          await this.spawnFn(
            "git",
            ["worktree", "remove", "--force", tmpBase],
            { cwd },
          );
        } catch {
          // Best-effort cleanup — failure here is non-fatal
          try {
            await fs.rm(tmpBase, { recursive: true, force: true });
          } catch {
            // Silently ignore double-failure
          }
        }
      }
    }
  }

  /**
   * Read a file from a specific commit OID using trailing-suffix path resolution.
   *
   * Algorithm (P0-2, achieved-assurance-completeness T-01):
   *   1. `git ls-tree -r --name-only <oid>` in cwd (exit non-0 → unavailable).
   *   2. Filter entries: `entry.endsWith("/" + pathSuffix) || entry.endsWith("-" + pathSuffix)`.
   *   3. 0 entries → unavailable (not found). ≥2 entries → unavailable (ambiguous).
   *   4. `git show <oid>:<resolvedPath>` → content (exit non-0 → unavailable).
   *   5. Return `{ kind:"found", path: resolvedPath, content }`.
   *
   * Never throws — returns unavailable on any error or spawn exception.
   */
  async readFileAtCommit(
    oid: string,
    pathSuffix: string,
    cwd: string,
  ): Promise<import("../port/runtime-strategy.js").CommitFileResult> {
    try {
      const lsResult = await this.spawnFn(
        "git",
        ["ls-tree", "-r", "--name-only", oid],
        { cwd },
      );
      if (lsResult.exitCode !== 0) {
        return {
          kind: "unavailable",
          reason: `git ls-tree failed (exit ${lsResult.exitCode}): ${lsResult.stderr?.trim() ?? ""}`,
        };
      }

      const entries = lsResult.stdout
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      const candidates = entries.filter(
        (e) => e.endsWith("/" + pathSuffix) || e.endsWith("-" + pathSuffix),
      );

      if (candidates.length === 0) {
        return {
          kind: "unavailable",
          reason: `readFileAtCommit: no entry matching suffix "${pathSuffix}" in ${oid}`,
        };
      }
      if (candidates.length >= 2) {
        return {
          kind: "unavailable",
          reason: `readFileAtCommit: ambiguous suffix "${pathSuffix}" matches ${candidates.length} entries in ${oid}: ${candidates.join(", ")}`,
        };
      }

      const resolvedPath = candidates[0]!;
      const showResult = await this.spawnFn(
        "git",
        ["show", `${oid}:${resolvedPath}`],
        { cwd },
      );
      if (showResult.exitCode !== 0) {
        return {
          kind: "unavailable",
          reason: `git show failed (exit ${showResult.exitCode}) for ${oid}:${resolvedPath}`,
        };
      }

      return { kind: "found", path: resolvedPath, content: showResult.stdout };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { kind: "unavailable", reason: `readFileAtCommit threw: ${reason}` };
    }
  }

  /**
   * Compute sha256 content hashes for a list of artifact paths (D4, artifact-observability).
   * Reads each file from disk; returns hash: null for missing/unreadable files.
   * Never throws — errors are silently swallowed per the best-effort lineage contract.
   */
  async digestArtifacts(refs: { path: string }[], cwd: string, _branch: string | null): Promise<ArtifactRef[]> {
    const results: ArtifactRef[] = [];
    for (const ref of refs) {
      const absPath = path.join(cwd, ref.path);
      try {
        const content = await fs.readFile(absPath);
        const hex = crypto.createHash("sha256").update(content).digest("hex");
        results.push({ path: ref.path, hash: `sha256:${hex}` });
      } catch {
        results.push({ path: ref.path, hash: null });
      }
    }
    return results;
  }

  /**
   * Validate declared step output contracts after the agent session completes.
   * No-throw — returns OutputCheckResult with violations.
   * Empty contracts → empty result.
   */
  async validateStepOutputs(
    contracts: OutputContract[],
    cwd: string,
    _branch: string | null,
  ): Promise<OutputCheckResult> {
    if (contracts.length === 0) return { violations: [] };
    const violations: import("../port/output-contract.js").OutputViolation[] = [];
    for (const contract of contracts) {
      if (contract.kind === "produced") {
        const absPath = path.join(cwd, contract.path);
        let content: string | null = null;
        try {
          content = await fs.readFile(absPath, "utf-8");
        } catch {
          // File missing → violation
        }
        const isViolation =
          content === null ||
          content.trim().length === 0 ||
          (contract.scaffold !== undefined && content === contract.scaffold);
        if (isViolation) {
          violations.push({ kind: contract.kind, path: contract.path, policy: contract.policy, detail: [] });
        }
      } else if (contract.kind === "tasks-complete") {
        const absPath = path.join(cwd, contract.path);
        let content: string | null = null;
        try {
          content = await fs.readFile(absPath, "utf-8");
        } catch {
          violations.push({ kind: contract.kind, path: contract.path, policy: contract.policy, detail: [] });
          continue;
        }
        const incomplete = parseIncompleteTaskLabels(content);
        if (incomplete.length > 0) {
          violations.push({ kind: contract.kind, path: contract.path, policy: contract.policy, detail: incomplete });
        }
      } else if (contract.kind === "content-format") {
        const absPath = path.join(cwd, contract.path);
        let content: string | null = null;
        try {
          content = await fs.readFile(absPath, "utf-8");
        } catch {
          // File missing → content stays null (evaluateContentFormatChecks will fail all checks)
        }
        const failedLabels = evaluateContentFormatChecks(content, contract.checks ?? []);
        if (failedLabels.length > 0) {
          violations.push({ kind: contract.kind, path: contract.path, policy: contract.policy, detail: failedLabels });
        }
      } else if (contract.kind === "test-coverage") {
        // Read test-cases.md from disk (contract.path is worktree-relative).
        // File absent → violation (test-materialize must produce test files after reading test-cases.md).
        const absPath = path.join(cwd, contract.path);
        let content: string;
        try {
          content = await fs.readFile(absPath, "utf-8");
        } catch {
          violations.push({ kind: contract.kind, path: contract.path, policy: contract.policy, detail: ["test-cases.md not found"] });
          continue;
        }
        // Evaluate coverage. Test execution is NOT performed — red tests are accepted.
        const result = await evaluateTestCoverage(content, cwd);
        if (result.status === "failed") {
          const detail = [...result.missingTcIds, ...result.assertionlessTcIds];
          violations.push({ kind: contract.kind, path: contract.path, policy: contract.policy, detail });
        }
        // status === "skipped" | "passed" → no violation
      }
    }
    return { violations };
  }

  async validateStepInputs(inputs: RequiredInput[], cwd: string, branch: string | null): Promise<void> {
    if (inputs.length === 0) return;
    const missing: string[] = [];
    for (const input of inputs) {
      if (input.artifact === "gitState") {
        // gitState: verify the working directory is a valid git repo (minimal check)
        try {
          const result = await this.spawnFn("git", ["rev-parse", "--git-dir"], { cwd });
          if (result.exitCode !== 0) missing.push(input.path);
        } catch {
          missing.push(input.path);
        }
      } else {
        // file: check filesystem presence
        try {
          await fs.access(path.join(cwd, input.path));
        } catch {
          missing.push(input.path);
        }
      }
    }
    if (missing.length > 0) {
      const pathList = missing.map(p => `  - ${p}`).join("\n");
      const branchNote = branch ? ` on branch '${branch}'` : "";
      throw new SpecRunnerError(
        ERROR_CODES.STEP_INPUT_MISSING,
        `Required step input(s) not found${branchNote}. Ensure prior steps have completed successfully.\nMissing:\n${pathList}`,
        `Required step input(s) not found: ${missing.join(", ")}`,
      );
    }
  }

  /**
   * Write the machine-local liveness sidecar to .specrunner/local/<slug>/liveness.json.
   * Contains: { pid, session: null, worktreePath, jobId }
   * worktreePath may be null for no-worktree mode.
   * pid defaults to process.pid; pass null for attach (not yet running).
   * Best-effort: silently swallows errors to avoid blocking workspace setup.
   */
  async writeLivenessSidecar(slug: string, jobId: string, worktreePath: string | null, pid: number | null = process.pid): Promise<void> {
    try {
      const sidecarAbsPath = path.join(this.cwd, livenessJsonPath(slug));
      await fs.mkdir(path.dirname(sidecarAbsPath), { recursive: true });
      await fs.writeFile(
        sidecarAbsPath,
        JSON.stringify({ pid, session: null, worktreePath, jobId }, null, 2),
        "utf-8",
      );
    } catch {
      // Best-effort — sidecar absence is handled gracefully in resume/cancel
    }
  }

  registerCleanup(jobId: string, startStep: string): CleanupHandle {
    const worktreePath = this.workspace?.worktreePath ?? null;
    const cwd = this.cwd;
    const manager = this.manager;
    const slugOpts = this.slugStoreOpts();

    const makeStore = () => {
      if (slugOpts) {
        return new JobStateStore(jobId, cwd, slugOpts);
      }
      throw new SpecRunnerError(
        ERROR_CODES.STEP_INPUT_MISSING,
        "Internal invariant violation: registerCleanup() called without slug/worktree context.",
        "makeStore: slugOpts is not set",
      );
    };

    // Acquire power assertion for the duration of this job
    const powerAssertion = acquirePowerAssertion({
      cwd,
      parentPid: process.pid,
      platform: this.platform,
      spawnBackgroundFn: this.spawnBackgroundFn,
    });
    const releasePowerAssertion = () => powerAssertion.release();

    // Best-effort cleanup for all failure paths.
    // On success the worktree is left for finish — finish cleans it up.
    const cleanupWorktreeOnFailure = async (): Promise<void> => {
      // Check if job is awaiting-resume — if so, keep worktree for resume
      try {
        const currentState = await makeStore().load();
        if (currentState?.status === "awaiting-resume") return;
      } catch { /* proceed with cleanup */ }
      try {
        if (worktreePath) {
          await manager.remove(worktreePath, cwd);
          await manager.prune(cwd);
          const store = makeStore();
          const current = await store.load();
          await store.persist({ ...current, worktreePath: null } as JobState);
        }
      } catch {
        // Best-effort; state file (layer 2) + prune (layer 3) handle residuals
      }
    };

    // Signal handler (layer 1 of 3-layer cleanup)
    const signalCleanup = async (): Promise<void> => {
      markSignalHandlerFired();
      try {
        const store = makeStore();
        const current = await store.load();
        // Append interruption event to journal (T-11)
        await store.appendInterruption({
          type: "interruption",
          reason: "signal",
          ts: new Date().toISOString(),
        });
        const { state: updated } = transitionJob(current as JobState, "awaiting-resume", {
          trigger: "signal-handler",
          reason: "Interrupted by signal",
          patch: {
            pid: null,
            resumePoint: {
              step: toStepName(current.step ?? startStep),
              reason: "Interrupted by signal",
              iterationsExhausted: 0,
            },
          },
        });
        await store.persist(updated);
      } catch {
        // Best-effort persist; state file (layer 2) handles residuals
      }
      releasePowerAssertion();
      process.exit(130); // 128 + SIGINT(2)
    };

    process.on("SIGINT", signalCleanup);
    process.on("SIGTERM", signalCleanup);

    return makeHandle({
      jobId,
      cwd,
      worktreePath,
      startStep,
      signalCleanup,
      cleanupWorktreeOnFailure,
      releasePowerAssertion,
    });
  }

  async teardown(handle: CleanupHandle, finalStatus: string): Promise<void> {
    const internals = getInternals(handle);

    // Deregister signal handlers
    process.off("SIGINT", internals.signalCleanup);
    process.off("SIGTERM", internals.signalCleanup);

    // Release power assertion (idempotent, all finalStatus values)
    internals.releasePowerAssertion();

    // Cleanup worktree on failure (on success, archive handles worktree cleanup)
    if (finalStatus !== "awaiting-archive") {
      await internals.cleanupWorktreeOnFailure();
    }
  }
}
