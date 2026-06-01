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
import type { JobState, StepName } from "../../state/schema.js";
import { transitionJob } from "../../state/lifecycle.js";
import type { SpawnFn } from "../../util/spawn.js";
import { spawnCommand } from "../../util/spawn.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { changeFolderPath } from "../../util/paths.js";
import { copyRulesToChangeFolder, copyDraftUsageToChangeFolder, rejectSymlink } from "../artifact/copy-artifacts.js";
import type { RuntimeStrategy, QueryOptions, WorkspaceOptions, WorkspaceContext, CleanupHandle } from "./strategy.js";
import type { AgentStep } from "../step/types.js";
import type { CommitPushInfra } from "../step/commit-push.js";
import { stderrWrite } from "../../logger/stdout.js";

export class ManagedRuntime implements RuntimeStrategy {
  private readonly spawnFn: SpawnFn;

  constructor(
    private readonly cwd: string,
    private readonly sessionClient: SessionClient,
    private readonly githubClient: GitHubClient,
    private readonly repo: OriginInfo,
    spawnFn: SpawnFn | undefined,
    private readonly githubToken: string,
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

  /**
   * Update job state atomically: load → mutate → persist.
   * Replaces the deprecated updateJobState() from state/store.ts.
   */
  private async updateJobState(jobId: string, mutator: (s: JobState) => JobState): Promise<void> {
    const store = new JobStateStore(jobId, this.cwd);
    const current = await store.load();
    const updated = mutator(current as JobState);
    await store.persist(updated);
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

    if (opts?.requestFilePath) {
      // Copy request.md into the change folder so agents can find it alongside design.md / tasks.md
      const changeFolderRequestPath = path.join(this.cwd, changeFolderPath(slug), "request.md");
      await fs.mkdir(path.dirname(changeFolderRequestPath), { recursive: true });
      await rejectSymlink(opts.requestFilePath);
      await fs.cp(opts.requestFilePath, changeFolderRequestPath);

      // git add change folder request.md
      const gitAddChangeFolderResult = await this.spawnFn(
        "git",
        ["add", path.join(changeFolderPath(slug), "request.md")],
        { cwd: this.cwd },
      );
      if (gitAddChangeFolderResult.exitCode !== 0) {
        // Non-fatal: log warning but don't fail setup
        stderrWrite(
          `Warning: failed to stage change folder request.md: ${gitAddChangeFolderResult.stderr.trim()}`,
        );
      }

      // Copy draft's usage.json into the change folder (silent no-op if absent)
      await copyDraftUsageToChangeFolder(opts.requestFilePath, this.cwd, slug, this.spawnFn);

      // Also copy rules.md into the change folder so agents can read project disciplines
      await copyRulesToChangeFolder(this.cwd, slug, this.spawnFn);

      // Update state.request.path to point to the permanent copy (not the draft)
      await this.updateJobState(jobId, (s) => ({
        ...s,
        request: { ...s.request, path: changeFolderRequestPath },
      }));

      // Delete draft file from main cwd (move semantics: draft consumed on run)
      try {
        if (opts.requestFilePath.endsWith("/request.md")) {
          // Directory-format draft: remove entire slug directory
          await fs.rm(path.dirname(opts.requestFilePath), { recursive: true, force: true });
        } else {
          // Legacy flat-file format: remove file only
          await fs.rm(opts.requestFilePath);
        }
      } catch {
        stderrWrite(
          `Warning: failed to delete draft file ${opts.requestFilePath} from main worktree. Remove it manually.`,
        );
      }

      // git commit request.md and rules.md
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
    await this.updateJobState(jobId, (s) => ({ ...s, branch: branchName }));

    return { cwd: this.cwd, branch: branchName };
  }

  buildDeps(
    config: SpecRunnerConfig,
    request: ParsedRequest,
    slug: string,
    workspace: WorkspaceContext,
  ): PipelineDeps {
    return {
      client: this.sessionClient,
      config,
      request,
      slug,
      githubClient: this.githubClient,
      githubToken: this.githubToken,
      owner: this.repo.owner,
      repo: this.repo.name,
      cwd: workspace.cwd,
      runner: this.createAgentRunner(),
      spawn: spawnCommand,
      storeFactory: (id: string) => new JobStateStore(id, this.cwd),
      runtimeStrategy: this,
    };
  }

  // ---------------------------------------------------------------------------
  // Step artifact lifecycle (B-8 seam) — managed: all no-ops
  // ---------------------------------------------------------------------------

  async captureHeadSha(_cwd: string): Promise<string | null> {
    return null;
  }

  async prepareStepArtifacts(
    _cwd: string,
    _slug: string,
    _stepName: string,
    _state: JobState,
  ): Promise<void> {
    // no-op: managed runtime has no local worktree artifacts
  }

  async finalizeStepArtifacts(
    _step: AgentStep,
    _state: JobState,
    _deps: PipelineDeps,
    _headBeforeStep: string | null,
    _commitPushInfra: CommitPushInfra,
  ): Promise<void> {
    // no-op: managed runtime does not commit/push from the CLI
  }

  registerCleanup(jobId: string, startStep: string): CleanupHandle {
    const signalCleanup = async (): Promise<void> => {
      try {
        const store = new JobStateStore(jobId, this.cwd);
        const current = await store.load();
        const { state: updated } = transitionJob(current as JobState, "awaiting-resume", {
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
        await store.persist(updated);
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
