/**
 * LocalRuntime: RuntimeStrategy implementation for local Claude Code SDK execution.
 *
 * Design D2: worktree creation, ClaudeCodeRunner, signal-handler cleanup.
 * All config.runtime === "local" logic lives here — not in CLI or pipeline.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { GitHubClient } from "../port/github-client.js";
import type { AgentRunner } from "../port/agent-runner.js";
import type { PipelineDeps } from "../types.js";
import type { SpecRunnerConfig } from "../../config/schema.js";
import type { OriginInfo } from "../../git/remote.js";
import type { ParsedRequest } from "../../parser/request-md.js";
import type { StepName } from "../../state/schema.js";
import { createClaudeCodeRunner, type QueryFn } from "../../adapter/claude-code/agent-runner.js";
import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk";
import { createWorktreeManager } from "../worktree/manager.js";
import { loadJobState, updateJobState } from "../../state/store.js";
import { spawnCommand } from "../../util/spawn.js";
import type { SpawnFn } from "../../util/spawn.js";
import { changeFolderPath } from "../../util/paths.js";
import type { RuntimeStrategy, QueryOptions, WorkspaceOptions, WorkspaceContext, CleanupHandle } from "./strategy.js";

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
  manager?: ReturnType<typeof createWorktreeManager>;
  spawnFn?: SpawnFn;
  queryFn?: QueryFn;
}

export class LocalRuntime implements RuntimeStrategy {
  private readonly cwd: string;
  private readonly githubClient: GitHubClient;
  private readonly manager: ReturnType<typeof createWorktreeManager>;
  private readonly spawnFn: SpawnFn;
  private readonly queryFn: QueryFn;

  // Set by setupWorkspace(); used by buildDeps() and registerCleanup()
  private workspace: WorkspaceContext | null = null;

  constructor(opts: LocalRuntimeOptions) {
    this.cwd = opts.cwd;
    this.githubClient = opts.githubClient;
    this.manager = opts.manager ?? createWorktreeManager();
    this.spawnFn = opts.spawnFn ?? spawnCommand;
    this.queryFn = opts.queryFn ?? (sdkQuery as unknown as QueryFn);
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
    return createClaudeCodeRunner({ cwd: worktreeCwd });
  }

  async setupWorkspace(
    slug: string,
    jobId: string,
    opts?: WorkspaceOptions,
  ): Promise<WorkspaceContext> {
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
        return workspace;
      } else {
        // Worktree was deleted — create a new one (resume path: fetch already ran during original run)
        const newWorktreePath = await this.manager.create(this.cwd, slug, jobId, remoteBaseRef);
        await updateJobState(jobId, (s) => ({ ...s, worktreePath: newWorktreePath }));
        const workspace: WorkspaceContext = {
          cwd: newWorktreePath,
          worktreePath: newWorktreePath,
        };
        this.workspace = workspace;
        return workspace;
      }
    }

    if (existingWorktreePath === null) {
      // Resume: no worktree recorded — create new one (fetch already ran during original run)
      const newWorktreePath = await this.manager.create(this.cwd, slug, jobId, remoteBaseRef);
      await updateJobState(jobId, (s) => ({ ...s, worktreePath: newWorktreePath }));
      const workspace: WorkspaceContext = {
        cwd: newWorktreePath,
        worktreePath: newWorktreePath,
      };
      this.workspace = workspace;
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
        process.stderr.write(
          `Warning: local ${baseBranch} is ${behind} commit(s) behind ${remoteBaseRef}. Worktree will be created from ${remoteBaseRef}.\n`,
        );
      }
    }

    // Pass branchName so manager creates the branch in the worktree (D1)
    const branchName = opts?.branchName;
    const worktreePath = await this.manager.create(this.cwd, slug, jobId, remoteBaseRef, branchName);

    // Record worktreePath in state before pipeline runs (enables crash recovery)
    await updateJobState(jobId, (s) => ({ ...s, worktreePath }));

    // Copy request.md into the worktree so the agent can read it
    if (opts?.requestFilePath) {
      const relativeRequestPath = path.relative(this.cwd, opts.requestFilePath);
      const worktreeRequestPath = path.join(worktreePath, relativeRequestPath);
      await fs.mkdir(path.dirname(worktreeRequestPath), { recursive: true });
      await fs.cp(opts.requestFilePath, worktreeRequestPath);

      // Stage the request file in the worktree
      const gitAddResult = await this.spawnFn("git", ["add", relativeRequestPath], { cwd: worktreePath });
      if (gitAddResult.exitCode !== 0) {
        // Cleanup worktree before propagating error
        await this.manager.remove(worktreePath, this.cwd).catch(() => {});
        await this.manager.prune(this.cwd).catch(() => {});
        throw new Error(`Failed to stage request file: ${gitAddResult.stderr.trim()}`);
      }

      // Also copy request.md into the change folder so agents can find it alongside design.md / tasks.md
      const changeFolderRequestPath = path.join(worktreePath, changeFolderPath(slug), "request.md");
      await fs.mkdir(path.dirname(changeFolderRequestPath), { recursive: true });
      await fs.cp(opts.requestFilePath, changeFolderRequestPath);

      // Stage the change folder request.md as well
      const gitAddChangeFolderResult = await this.spawnFn(
        "git",
        ["add", path.join(changeFolderPath(slug), "request.md")],
        { cwd: worktreePath },
      );
      if (gitAddChangeFolderResult.exitCode !== 0) {
        // Non-fatal: log warning but don't fail setup
        process.stderr.write(
          `Warning: failed to stage change folder request.md: ${gitAddChangeFolderResult.stderr.trim()}\n`,
        );
      }

      // Commit request.md (both locations) as the first commit on the feature branch (D2)
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
      await updateJobState(jobId, (s) => ({ ...s, branch: branchName }));
    }

    const workspace: WorkspaceContext = {
      cwd: worktreePath,
      worktreePath,
      branch: branchName,
    };
    this.workspace = workspace;
    return workspace;
  }

  buildDeps(
    config: SpecRunnerConfig,
    repo: OriginInfo,
    request: ParsedRequest,
    slug: string,
    workspace: WorkspaceContext,
  ): PipelineDeps {
    return {
      client: undefined,
      config,
      repo,
      request,
      slug,
      githubClient: this.githubClient,
      cwd: workspace.cwd,
      runner: this.createAgentRunner(),
    };
  }

  registerCleanup(jobId: string, startStep: string): CleanupHandle {
    const worktreePath = this.workspace?.worktreePath ?? null;
    const cwd = this.cwd;
    const manager = this.manager;

    // Best-effort cleanup for all failure paths.
    // On success the worktree is left for finish — finish cleans it up.
    const cleanupWorktreeOnFailure = async (): Promise<void> => {
      // Check if job is awaiting-resume — if so, keep worktree for resume
      try {
        const currentState = await loadJobState(jobId);
        if (currentState?.status === "awaiting-resume") return;
      } catch { /* proceed with cleanup */ }
      try {
        if (worktreePath) {
          await manager.remove(worktreePath, cwd);
          await manager.prune(cwd);
          await updateJobState(jobId, (s) => ({ ...s, worktreePath: null }));
        }
      } catch {
        // Best-effort; state file (layer 2) + prune (layer 3) handle residuals
      }
    };

    // Signal handler (layer 1 of 3-layer cleanup)
    const signalCleanup = async (): Promise<void> => {
      try {
        await updateJobState(jobId, (s) => ({
          ...s,
          status: "awaiting-resume" as const,
          pid: null,
          resumePoint: {
            step: startStep as StepName,
            reason: "Interrupted by signal",
            iterationsExhausted: 0,
          },
          updatedAt: new Date().toISOString(),
        }));
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

    // Cleanup worktree on failure (on success, finish handles worktree cleanup)
    if (finalStatus !== "awaiting-merge") {
      await internals.cleanupWorktreeOnFailure();
    }
  }
}
