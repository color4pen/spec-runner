/**
 * ManagedRuntime: RuntimeStrategy implementation for Anthropic Managed Agents.
 *
 * Design D3: SessionClient, ManagedAgentRunner, no-op workspace/cleanup.
 * All config.runtime !== "local" logic lives here — not in CLI or pipeline.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SessionClient } from "../port/session-client.js";
import type { GitHubClient } from "../port/github-client.js";
import type { AgentRunner } from "../port/agent-runner.js";
import type { PipelineDeps } from "../types.js";
import type { SpecRunnerConfig } from "../../config/schema.js";
import type { OriginInfo } from "../../git/remote.js";
import type { ParsedRequest } from "../../parser/request-md.js";
import { createManagedAgentRunner } from "../../adapter/managed-agent/agent-runner.js";
import { updateJobState } from "../../state/store.js";
import type { SpawnFn } from "../../util/spawn.js";
import { spawnCommand } from "../../util/spawn.js";
import type { RuntimeStrategy, QueryOptions, WorkspaceOptions, WorkspaceContext, CleanupHandle } from "./strategy.js";

// Empty opaque handle for managed runtime (no-op)
const MANAGED_NOOP_HANDLE = {} as unknown as CleanupHandle;

export class ManagedRuntime implements RuntimeStrategy {
  private readonly spawnFn: SpawnFn;

  constructor(
    private readonly cwd: string,
    private readonly sessionClient: SessionClient,
    private readonly githubClient: GitHubClient,
    private readonly repo: OriginInfo,
    spawnFn?: SpawnFn,
  ) {
    this.spawnFn = spawnFn ?? spawnCommand;
  }

  /**
   * SSE-based agent query via SessionClient.
   * Minimal implementation for interface compliance — future dialog use.
   */
  async *query(_prompt: string, _opts?: QueryOptions): AsyncGenerator<unknown> {
    // Managed dialog not yet implemented; placeholder for RuntimeStrategy contract
  }

  createAgentRunner(): AgentRunner {
    return createManagedAgentRunner({
      sessionClient: this.sessionClient,
      githubClient: this.githubClient,
      repo: this.repo,
    });
  }

  async setupWorkspace(
    slug: string,
    jobId: string,
    opts?: WorkspaceOptions,
  ): Promise<WorkspaceContext> {
    // Resume path or no branchName: no-op (maintain existing behavior)
    const branchName = opts?.branchName;
    if (!branchName) {
      return { cwd: this.cwd };
    }

    // Run path: create branch + commit request.md (D6)
    // git checkout -b <branchName>
    const checkoutResult = await this.spawnFn(
      "git",
      ["checkout", "-b", branchName],
      { cwd: this.cwd },
    );
    if (checkoutResult.exitCode !== 0) {
      throw new Error(
        `git checkout -b failed (exit ${checkoutResult.exitCode}): ${checkoutResult.stderr.trim()}`,
      );
    }

    // git push origin <branchName>
    const pushBranchResult = await this.spawnFn(
      "git",
      ["push", "origin", branchName],
      { cwd: this.cwd },
    );
    if (pushBranchResult.exitCode !== 0) {
      throw new Error(
        `git push origin ${branchName} failed (exit ${pushBranchResult.exitCode}): ${pushBranchResult.stderr.trim()}`,
      );
    }

    // Copy request.md if provided
    if (opts?.requestFilePath) {
      const relativeRequestPath = path.relative(this.cwd, opts.requestFilePath);
      const destPath = path.join(this.cwd, relativeRequestPath);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      // Only copy if source and dest differ
      if (opts.requestFilePath !== destPath) {
        await fs.cp(opts.requestFilePath, destPath);
      }

      // git add
      const gitAddResult = await this.spawnFn(
        "git",
        ["add", relativeRequestPath],
        { cwd: this.cwd },
      );
      if (gitAddResult.exitCode !== 0) {
        throw new Error(`Failed to stage request file: ${gitAddResult.stderr.trim()}`);
      }

      // git commit
      const gitCommitResult = await this.spawnFn(
        "git",
        ["commit", "-m", `add request.md for ${slug}`],
        { cwd: this.cwd },
      );
      if (gitCommitResult.exitCode !== 0) {
        throw new Error(`Failed to commit request file: ${gitCommitResult.stderr.trim()}`);
      }

      // git push origin <branchName>
      const pushCommitResult = await this.spawnFn(
        "git",
        ["push", "origin", branchName],
        { cwd: this.cwd },
      );
      if (pushCommitResult.exitCode !== 0) {
        throw new Error(
          `git push origin ${branchName} after commit failed (exit ${pushCommitResult.exitCode}): ${pushCommitResult.stderr.trim()}`,
        );
      }
    }

    // Record branchName in state (D3)
    await updateJobState(jobId, (s) => ({ ...s, branch: branchName }));

    return { cwd: this.cwd, branch: branchName };
  }

  buildDeps(
    config: SpecRunnerConfig,
    repo: OriginInfo,
    request: ParsedRequest,
    slug: string,
    workspace: WorkspaceContext,
  ): PipelineDeps {
    return {
      client: this.sessionClient,
      config,
      repo,
      request,
      slug,
      githubClient: this.githubClient,
      cwd: workspace.cwd,
      runner: this.createAgentRunner(),
    };
  }

  registerCleanup(_jobId: string, _startStep: string): CleanupHandle {
    // Managed runtime: no signal handlers or worktree cleanup needed
    return MANAGED_NOOP_HANDLE;
  }

  async teardown(_handle: CleanupHandle, _finalStatus: string): Promise<void> {
    // Managed runtime: no-op
  }
}
