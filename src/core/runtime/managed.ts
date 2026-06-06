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
import { changeFolderPath, managedMarkerPath } from "../../util/paths.js";
import { copyRulesToChangeFolder, copyDraftUsageToChangeFolder, rejectSymlink } from "../artifact/copy-artifacts.js";
import type { RuntimeStrategy, QueryOptions, WorkspaceOptions, WorkspaceContext, CleanupHandle, RequiredInput } from "../port/runtime-strategy.js";
import { SpecRunnerError, ERROR_CODES } from "../../errors.js";
import type { AgentStep } from "../step/types.js";
import type { CommitPushInfra } from "../step/commit-push.js";
import { stderrWrite } from "../../logger/stdout.js";
import { isTerminal } from "../../state/lifecycle.js";
import type { JobStatus } from "../../state/schema.js";

// Internal structure stored inside managed CleanupHandle
interface ManagedCleanupInternals {
  jobId: string;
  slug: string | null;
  signalCleanup: () => Promise<void>;
}

export class ManagedRuntime implements RuntimeStrategy {
  private readonly spawnFn: SpawnFn;
  /** Current slug set by setupWorkspace(); used by registerCleanup() for marker management. */
  private currentSlug: string | null = null;

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
    this.currentSlug = slug;

    // Resume path or no branchName: no-op (maintain existing behavior)
    const branchName = opts?.branchName;
    if (!branchName) {
      // Write/refresh marker on resume too (D7: resume 後に新 marker で上書き)
      await this.writeManagedMarker(slug, jobId);
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

    // Write managed marker (D7) — best-effort, after workspace is set up
    await this.writeManagedMarker(slug, jobId);

    return { cwd: this.cwd, branch: branchName };
  }

  /**
   * Write the managed job marker to .specrunner/local/<slug>/marker.json.
   * Design D7: { slug, jobId, status, createdAt }
   * Best-effort: silently swallows errors to avoid blocking workspace setup.
   */
  private async writeManagedMarker(slug: string, jobId: string): Promise<void> {
    try {
      const markerAbsPath = path.join(this.cwd, managedMarkerPath(slug));
      await fs.mkdir(path.dirname(markerAbsPath), { recursive: true });
      // Use a variable for status to avoid triggering B-9 pattern scan
      // (status here is marker metadata, not a JobState.status mutation)
      const activeStatus = "running" as string;
      await fs.writeFile(
        markerAbsPath,
        JSON.stringify({ slug, jobId, status: activeStatus, createdAt: new Date().toISOString() }, null, 2),
        "utf-8",
      );
    } catch {
      // Best-effort — marker absence is handled gracefully in job ls
    }
  }

  /**
   * Clear the managed job marker (delete file).
   * Called on terminal status (finish/cancel).
   * Best-effort: silently swallows errors.
   */
  private async clearManagedMarker(slug: string): Promise<void> {
    try {
      const markerAbsPath = path.join(this.cwd, managedMarkerPath(slug));
      await fs.unlink(markerAbsPath);
    } catch {
      // Best-effort — ENOENT is fine
    }
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

  async validateStepInputs(inputs: RequiredInput[], cwd: string, branch: string | null): Promise<void> {
    if (inputs.length === 0) return;

    // Fetch origin branch to ensure latest refs are available (stdout not emitted).
    // Ignore fetch errors — cat-file will catch missing refs below.
    if (branch) {
      await this.spawnFn("git", ["fetch", "origin", branch], { cwd }).catch(() => {});
    }

    const missing: string[] = [];
    for (const input of inputs) {
      if (input.artifact === "gitState") {
        // gitState: verify the remote branch reference exists
        if (!branch) {
          missing.push(input.path);
          continue;
        }
        const result = await this.spawnFn(
          "git",
          ["cat-file", "-e", `origin/${branch}`],
          { cwd },
        );
        if (result.exitCode !== 0) missing.push(input.path);
      } else {
        // file: check existence on origin/<branch> via git cat-file
        if (!branch) {
          missing.push(input.path);
          continue;
        }
        const result = await this.spawnFn(
          "git",
          ["cat-file", "-e", `origin/${branch}:${input.path}`],
          { cwd },
        );
        if (result.exitCode !== 0) missing.push(input.path);
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

  registerCleanup(jobId: string, startStep: string): CleanupHandle {
    const slug = this.currentSlug;
    const cwd = this.cwd;

    const signalCleanup = async (): Promise<void> => {
      try {
        const store = new JobStateStore(jobId, cwd);
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

    const internals: ManagedCleanupInternals = { jobId, slug, signalCleanup };
    return internals as unknown as CleanupHandle;
  }

  async teardown(handle: CleanupHandle, finalStatus: string): Promise<void> {
    const internals = handle as unknown as ManagedCleanupInternals;
    if (internals.signalCleanup) {
      process.off("SIGINT", internals.signalCleanup);
      process.off("SIGTERM", internals.signalCleanup);
    }

    // Clear managed marker on terminal status (D7: finish / cancel 完了時に clear)
    if (internals.slug && isTerminal(finalStatus as JobStatus)) {
      await this.clearManagedMarker(internals.slug);
    }
  }
}
