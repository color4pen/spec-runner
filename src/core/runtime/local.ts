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
import type { SpecRunnerConfig } from "../../config/schema.js";
import type { ParsedRequest } from "../../parser/request-md.js";
import type { JobState } from "../../state/schema.js";
import { toStepName } from "../step/step-names.js";
import { createClaudeCodeRunner, defaultQueryFn, type QueryFn } from "../../adapter/claude-code/agent-runner.js";
import { DispatchingAgentRunner } from "../../adapter/dispatching/agent-runner.js";
import { createWorktreeManager } from "../worktree/manager.js";
import { spawnCommand } from "../../util/spawn.js";
import type { SpawnFn } from "../../util/spawn.js";
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
import { commitAndPush, commitFinalState } from "../step/commit-push.js";
import type { CommitPushInfra } from "../step/commit-push.js";
import type { AgentStep } from "../step/types.js";
import type { RuntimeStrategy, QueryOptions, WorkspaceOptions, WorkspaceContext, CleanupHandle, RequiredInput, FindingRef } from "../port/runtime-strategy.js";
import type { ArtifactRef } from "../../store/event-journal.js";
import { SpecRunnerError, ERROR_CODES, worktreeDirtyError } from "../../errors.js";
import { stderrWrite } from "../../logger/stdout.js";
import { logPipelineDiag } from "../lifecycle/diagnostic.js";
import { stripSecrets } from "../../util/env-filter.js";

// Internal structure stored inside CleanupHandle
interface LocalCleanupInternals {
  jobId: string;
  cwd: string;
  worktreePath: string | null;
  startStep: string;
  signalCleanup: () => Promise<void>;
  cleanupWorktreeOnFailure: () => Promise<void>;
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
}

export class LocalRuntime implements RuntimeStrategy {
  private readonly cwd: string;
  private readonly githubClient: GitHubClient;
  private readonly githubToken: string;
  private readonly owner: string;
  private readonly repo: string;
  private readonly manager: ReturnType<typeof createWorktreeManager>;
  private readonly spawnFn: SpawnFn;
  private readonly queryFn: QueryFn;

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
  }

  /**
   * Update job state: load from slug store → mutate → persist to slug store.
   *
   * Slug-only strategy (T-02): no longer writes to jobId-based store.
   * All callers must explicitly pass slugOpts; the slug store must exist (seeded by
   * setupWorkspace before the first updateJobState call).
   */
  private async updateJobState(
    jobId: string,
    mutator: (s: JobState) => JobState,
    slugOpts: { slug: string; stateRoot: string },
  ): Promise<void> {
    const slugStore = new JobStateStore(jobId, this.cwd, slugOpts);
    const current = (await slugStore.load()) as JobState;
    const updated = mutator(current);
    await slugStore.persist(updated);
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
    const claudeRunner = createClaudeCodeRunner({ cwd: worktreeCwd, _queryFn: this.queryFn });
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

    // No-worktree mode: bypass worktree creation and use cwd directly
    if (opts?.noWorktree) {
      return this.setupWorkspaceNoWorktree(slug, jobId, opts);
    }

    const baseBranch = opts?.baseBranch ?? "main";
    const remoteBaseRef = `origin/${baseBranch}`;
    const existingWorktreePath = opts?.existingWorktreePath;

    if (existingWorktreePath !== undefined && existingWorktreePath !== null) {
      // Resume path: check if existing worktree is still on disk
      let worktreeExists = false;
      try {
        await fs.access(existingWorktreePath);
        worktreeExists = true;
      } catch {
        worktreeExists = false;
      }

      if (worktreeExists) {
        // Reuse existing worktree
        const workspace: WorkspaceContext = {
          cwd: existingWorktreePath,
          worktreePath: existingWorktreePath,
        };
        this.workspace = workspace;
        // Refresh sidecar pid for the resuming process (T-03)
        await this.writeLivenessSidecar(slug, jobId, existingWorktreePath);
        // Resume: recopy draft request.md into change folder (copy semantics)
        await recopyDraftToChangeFolder(this.cwd, workspace.cwd, slug, this.spawnFn);
        return workspace;
      } else {
        // Worktree was deleted — create a new one (resume path: fetch already ran during original run)
        const newWorktreePath = await this.manager.create(this.cwd, slug, jobId, remoteBaseRef);
        const workspace: WorkspaceContext = {
          cwd: newWorktreePath,
          worktreePath: newWorktreePath,
        };
        this.workspace = workspace;
        const slugOpts = { slug, stateRoot: newWorktreePath };
        // Seed slug store with bootstrap state before updateJobState (T-02)
        if (opts?.bootstrapState) {
          await new JobStateStore(jobId, this.cwd, slugOpts).persist(opts.bootstrapState);
        }
        await this.updateJobState(jobId, (s) => ({ ...s, worktreePath: newWorktreePath }), slugOpts);
        await this.writeLivenessSidecar(slug, jobId, newWorktreePath);
        // Resume: recopy draft request.md into change folder (copy semantics)
        await recopyDraftToChangeFolder(this.cwd, workspace.cwd, slug, this.spawnFn);
        return workspace;
      }
    }

    if (existingWorktreePath === null) {
      // Resume: no worktree recorded — create new one (fetch already ran during original run)
      const newWorktreePath = await this.manager.create(this.cwd, slug, jobId, remoteBaseRef);
      const workspace: WorkspaceContext = {
        cwd: newWorktreePath,
        worktreePath: newWorktreePath,
      };
      this.workspace = workspace;
      const slugOpts = { slug, stateRoot: newWorktreePath };
      // Seed slug store with bootstrap state before updateJobState (T-02)
      if (opts?.bootstrapState) {
        await new JobStateStore(jobId, this.cwd, slugOpts).persist(opts.bootstrapState);
      }
      await this.updateJobState(jobId, (s) => ({ ...s, worktreePath: newWorktreePath }), slugOpts);
      await this.writeLivenessSidecar(slug, jobId, newWorktreePath);
      // Resume: recopy draft request.md into change folder (copy semantics)
      await recopyDraftToChangeFolder(this.cwd, workspace.cwd, slug, this.spawnFn);
      return workspace;
    }

    // Run path: fetch origin to ensure freshness, then create new worktree from origin/main
    const fetchResult = await this.spawnFn("git", ["fetch", "origin"], { cwd: this.cwd });
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

    // Pass branchName so manager creates the branch in the worktree (D1)
    const branchName = opts?.branchName;
    const worktreePath = await this.manager.create(this.cwd, slug, jobId, remoteBaseRef, branchName);

    // workspace must be set before updateJobState so slugStoreOpts() works
    const workspaceCtx: WorkspaceContext = {
      cwd: worktreePath,
      worktreePath,
      branch: branchName,
    };
    this.workspace = workspaceCtx;

    // Seed slug store with bootstrap state before updateJobState (T-02)
    const slugOpts = { slug, stateRoot: worktreePath };
    if (opts?.bootstrapState) {
      await new JobStateStore(jobId, this.cwd, slugOpts).persist(opts.bootstrapState);
    }

    // Record worktreePath in state (slug-based store) and write liveness sidecar
    await this.updateJobState(jobId, (s) => ({ ...s, worktreePath }), slugOpts);
    await this.writeLivenessSidecar(slug, jobId, worktreePath);

    // Copy request.md into the change folder so the agent can read it
    if (opts?.requestFilePath) {
      // Only copy request.md into the change folder (no canonical path copy)
      const changeFolderRequestPath = path.join(worktreePath, changeFolderPath(slug), "request.md");
      await fs.mkdir(path.dirname(changeFolderRequestPath), { recursive: true });
      await rejectSymlink(opts.requestFilePath);
      await fs.cp(opts.requestFilePath, changeFolderRequestPath);

      // Stage the change folder request.md
      const gitAddChangeFolderResult = await this.spawnFn(
        "git",
        ["add", path.join(changeFolderPath(slug), "request.md")],
        { cwd: worktreePath },
      );
      if (gitAddChangeFolderResult.exitCode !== 0) {
        // Cleanup worktree before propagating error
        await this.manager.remove(worktreePath, this.cwd).catch(() => {});
        await this.manager.prune(this.cwd).catch(() => {});
        throw new Error(`Failed to stage change folder request.md: ${gitAddChangeFolderResult.stderr.trim()}`);
      }

      // Copy draft's usage.json into the change folder (silent no-op if absent)
      await copyDraftUsageToChangeFolder(opts.requestFilePath, worktreePath, slug, this.spawnFn);

      // Also copy rules.md into the change folder so agents can read project disciplines
      await copyRulesToChangeFolder(worktreePath, slug, this.spawnFn);

      // Update state.request.path to point to the permanent copy (not the draft)
      // In slug mode, request.path is derived from convention at load time — this persist is a no-op for path field.
      await this.updateJobState(jobId, (s) => ({
        ...s,
        request: { ...s.request, path: changeFolderRequestPath },
      }), { slug, stateRoot: worktreePath });

      // Commit change folder request.md and rules.md as the first commit on the feature branch (D2)
      const gitCommitResult = await this.spawnFn(
        "git",
        ["commit", "-m", `add request.md for ${slug}`],
        { cwd: worktreePath },
      );
      if (gitCommitResult.exitCode !== 0) {
        // Cleanup worktree before propagating error
        await this.manager.remove(worktreePath, this.cwd).catch(() => {});
        await this.manager.prune(this.cwd).catch(() => {});
        throw new Error(`Failed to commit request file: ${gitCommitResult.stderr.trim()}`);
      }
    }

    // Record branchName in state so downstream steps can use it (D3)
    if (branchName) {
      await this.updateJobState(jobId, (s) => ({ ...s, branch: branchName }), { slug, stateRoot: worktreePath });
    }

    return workspaceCtx;
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
      spawn: spawnCommand,
      storeFactory: (id: string) => {
        const stateRoot = workspace.worktreePath ?? workspace.cwd;
        return new JobStateStore(id, this.cwd, { slug, stateRoot });
      },
      repoRoot: this.cwd,
      runtimeStrategy: this,
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
   * D5: commit and push slug canonical state after pipeline running → awaiting-archive transition.
   * - git add -A → commit "finalize: <slug>" → push origin <branch> (1 retry)
   * - Push failures warn on stderr but do not throw.
   */
  async commitFinalState(deps: PipelineDeps, state: JobState): Promise<void> {
    const cwd = deps.cwd ?? process.cwd();
    const branch = state.branch ?? "";
    const slug = deps.slug;
    await commitFinalState({ cwd, branch, slug, spawnFn: this.spawnFn });
  }

  async verifyFindingRefs(refs: FindingRef[], cwd: string, _branch: string | null): Promise<FindingRef[]> {
    if (refs.length === 0) return [];
    const nonExistent: FindingRef[] = [];
    for (const ref of refs) {
      const absPath = path.join(cwd, ref.file);
      let content: string | null = null;
      try {
        content = await fs.readFile(absPath, "utf-8");
      } catch {
        nonExistent.push(ref);
        continue;
      }
      if (ref.line !== undefined) {
        const lineCount = content.split("\n").length;
        if (ref.line > lineCount) {
          nonExistent.push(ref);
        }
      }
    }
    return nonExistent;
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
   * Best-effort: silently swallows errors to avoid blocking workspace setup.
   */
  private async writeLivenessSidecar(slug: string, jobId: string, worktreePath: string | null): Promise<void> {
    try {
      const sidecarAbsPath = path.join(this.cwd, livenessJsonPath(slug));
      await fs.mkdir(path.dirname(sidecarAbsPath), { recursive: true });
      await fs.writeFile(
        sidecarAbsPath,
        JSON.stringify({ pid: process.pid, session: null, worktreePath, jobId }, null, 2),
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
    });
  }

  async teardown(handle: CleanupHandle, finalStatus: string): Promise<void> {
    const internals = getInternals(handle);

    // Deregister signal handlers
    process.off("SIGINT", internals.signalCleanup);
    process.off("SIGTERM", internals.signalCleanup);

    // Cleanup worktree on failure (on success, archive handles worktree cleanup)
    if (finalStatus !== "awaiting-archive") {
      await internals.cleanupWorktreeOnFailure();
    }
  }
}
