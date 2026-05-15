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
import { updateJobState, loadJobState } from "../../state/store.js";
import { transitionJob } from "../../state/lifecycle.js";
import type { StepName } from "../../state/schema.js";
import type { SpawnFn } from "../../util/spawn.js";
import { spawnCommand } from "../../util/spawn.js";
import { changeFolderPath } from "../../util/paths.js";
import type { RuntimeStrategy, QueryOptions, WorkspaceOptions, WorkspaceContext, CleanupHandle } from "./strategy.js";

export class ManagedRuntime implements RuntimeStrategy {
  private readonly spawnFn: SpawnFn;

  constructor(
    private readonly cwd: string,
    private readonly sessionClient: SessionClient,
    private readonly githubClient: GitHubClient,
    private readonly repo: OriginInfo,
    spawnFn?: SpawnFn,
    private readonly githubToken: string = "",
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
      githubToken: this.githubToken,
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

      // git add request file
      const gitAddResult = await this.spawnFn(
        "git",
        ["add", relativeRequestPath],
        { cwd: this.cwd },
      );
      if (gitAddResult.exitCode !== 0) {
        throw new Error(`Failed to stage request file: ${gitAddResult.stderr.trim()}`);
      }

      // Also copy request.md into the change folder so agents can find it alongside design.md / tasks.md
      const changeFolderRequestPath = path.join(this.cwd, changeFolderPath(slug), "request.md");
      await fs.mkdir(path.dirname(changeFolderRequestPath), { recursive: true });
      await fs.cp(opts.requestFilePath, changeFolderRequestPath);

      // git add change folder request.md
      const gitAddChangeFolderResult = await this.spawnFn(
        "git",
        ["add", path.join(changeFolderPath(slug), "request.md")],
        { cwd: this.cwd },
      );
      if (gitAddChangeFolderResult.exitCode !== 0) {
        // Non-fatal: log warning but don't fail setup
        process.stderr.write(
          `Warning: failed to stage change folder request.md: ${gitAddChangeFolderResult.stderr.trim()}\n`,
        );
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
      githubToken: this.githubToken,
      cwd: workspace.cwd,
      runner: this.createAgentRunner(),
    };
  }

  registerCleanup(jobId: string, startStep: string): CleanupHandle {
    const signalCleanup = async (): Promise<void> => {
      try {
        const current = await loadJobState(jobId);
        const { state: updated } = transitionJob(current, "awaiting-resume", {
          trigger: "signal-handler",
          reason: "Interrupted by signal",
          patch: {
            pid: null,
            resumePoint: {
              step: startStep as StepName,
              reason: "Interrupted by signal",
              iterationsExhausted: 0,
            },
          },
        });
        await updateJobState(jobId, () => updated);
      } catch {
        // Best-effort persist
      }
      process.exit(130);
    };

    process.on("SIGINT", signalCleanup);
    process.on("SIGTERM", signalCleanup);

    return { __signalCleanup: signalCleanup } as unknown as CleanupHandle;
  }

  async teardown(handle: CleanupHandle, _finalStatus: string): Promise<void> {
    const internals = handle as unknown as { __signalCleanup?: () => void };
    if (internals.__signalCleanup) {
      process.off("SIGINT", internals.__signalCleanup);
      process.off("SIGTERM", internals.__signalCleanup);
    }
  }
}
