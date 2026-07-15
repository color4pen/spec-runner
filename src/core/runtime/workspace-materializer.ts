/**
 * WorktreeMaterializationPlan: discriminated union describing how to materialize
 * a worktree for a job. Each variant corresponds to one of the five setup arms
 * in LocalRuntime.setupWorkspace():
 *
 *   - "no-worktree"                      : opts.noWorktree === true; use cwd as-is
 *   - "resume-existing"                  : existingWorktreePath is present on disk
 *   - "resume-recreated"                 : existingWorktreePath was recorded but deleted
 *   - "resume-without-recorded-worktree" : existingWorktreePath === null (no record)
 *   - "new-run"                          : fresh run; fetch → create new worktree
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { WorktreeManager } from "../worktree/manager.js";
import type { SpawnFn } from "../../util/spawn.js";
import type { WorkspaceSetupPlan } from "../worktree/setup.js";
import type { WorkspaceContext, WorkspaceOptions } from "../port/runtime-strategy.js";
import type { JobState } from "../../state/schema.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { changeFolderPath } from "../../util/paths.js";
import {
  copyRulesToChangeFolder,
  copyDraftUsageToChangeFolder,
  recopyDraftToChangeFolder,
  rejectSymlink,
} from "../artifact/copy-artifacts.js";

export type WorktreeMaterializationPlan =
  | { kind: "no-worktree" }
  | { kind: "resume-existing"; worktreePath: string }
  | { kind: "resume-recreated"; remoteBaseRef: string }
  | { kind: "resume-without-recorded-worktree"; remoteBaseRef: string }
  | { kind: "new-run"; remoteBaseRef: string; branchName?: string }
  | { kind: "attach-from-checkpoint"; checkpointRef: string; branchName: string };

/**
 * Host seam: the capabilities WorkspaceMaterializer needs from LocalRuntime.
 * Materializer never imports LocalRuntime directly — all side effects go through
 * this narrow interface, keeping the two modules loosely coupled.
 */
export interface MaterializerHost {
  readonly cwd: string;
  readonly manager: WorktreeManager;
  readonly spawnFn: SpawnFn;
  resolveSetupPlan(): WorkspaceSetupPlan;
  registerWorkspace(workspace: WorkspaceContext): void;
  updateJobState(
    jobId: string,
    mutator: (s: JobState) => JobState,
    slugOpts: { slug: string; stateRoot: string },
  ): Promise<void>;
  writeLivenessSidecar(slug: string, jobId: string, worktreePath: string | null, pid?: number | null): Promise<void>;
}

/**
 * WorkspaceMaterializer: owns the worktree create / registration / liveness sequence.
 *
 * Extracted from LocalRuntime.materializeWorktree() to give the materializer module
 * clear ownership of:
 *   - manager.create() calls (two sites: resume-recreated and new-run)
 *   - workspace registration (host.registerWorkspace)
 *   - bootstrap seed before updateJobState (T-02 invariant)
 *   - liveness sidecar writes
 *   - failure-path cleanup (manager.remove + prune before throw)
 *
 * Ordering invariants preserved inside materialize():
 *   1. registerWorkspace() before updateJobState() — updateJobState uses slug store
 *      opts that depend on workspace.worktreePath being set.
 *   2. bootstrapState seed before updateJobState() — slug store must exist before
 *      updateJobState loads and mutates it.
 *   3. Failure cleanup: manager.remove() + manager.prune() before throw.
 */
export class WorkspaceMaterializer {
  constructor(private readonly host: MaterializerHost) {}

  async materialize(
    slug: string,
    jobId: string,
    plan: Exclude<WorktreeMaterializationPlan, { kind: "no-worktree" }>,
    opts?: WorkspaceOptions,
  ): Promise<WorkspaceContext> {
    switch (plan.kind) {
      case "resume-existing": {
        const workspace: WorkspaceContext = {
          cwd: plan.worktreePath,
          worktreePath: plan.worktreePath,
        };
        this.host.registerWorkspace(workspace);
        // Refresh sidecar pid for the resuming process (T-03)
        await this.host.writeLivenessSidecar(slug, jobId, plan.worktreePath);
        // Resume: recopy draft request.md into change folder (copy semantics)
        await recopyDraftToChangeFolder(this.host.cwd, workspace.cwd, slug, this.host.spawnFn);
        return workspace;
      }

      case "resume-recreated":
      case "resume-without-recorded-worktree": {
        // Worktree was deleted or was never recorded — create a new one.
        // (fetch already ran during the original run)
        const setupPlan = this.host.resolveSetupPlan();
        const newWorktreePath = await this.host.manager.create(
          this.host.cwd, slug, jobId, plan.remoteBaseRef, undefined, setupPlan,
        );
        const workspace: WorkspaceContext = {
          cwd: newWorktreePath,
          worktreePath: newWorktreePath,
        };
        // workspace must be registered before updateJobState so slugStoreOpts() works (invariant 1)
        this.host.registerWorkspace(workspace);
        const slugOpts = { slug, stateRoot: newWorktreePath };
        // Seed slug store with bootstrap state before updateJobState (T-02, invariant 2)
        if (opts?.bootstrapState) {
          await new JobStateStore(jobId, this.host.cwd, slugOpts).persist(opts.bootstrapState);
        }
        await this.host.updateJobState(jobId, (s) => ({ ...s, worktreePath: newWorktreePath }), slugOpts);
        await this.host.writeLivenessSidecar(slug, jobId, newWorktreePath);
        // Resume: recopy draft request.md into change folder (copy semantics)
        await recopyDraftToChangeFolder(this.host.cwd, workspace.cwd, slug, this.host.spawnFn);
        return workspace;
      }

      case "attach-from-checkpoint": {
        // Materialize a worktree from the checkpoint commit on the remote feature branch.
        // The checkpoint tree already contains state.json / events.jsonl / request.md —
        // do NOT seed, updateJobState, or recopy (would overwrite the branch-borne truth).
        const setupPlan = this.host.resolveSetupPlan();

        // D4: check whether the local branch already existed BEFORE this call.
        // If it did, we must NOT delete it on failure (it has commits that predate this attach).
        // Only branches that did NOT exist before (created by manager.create itself) may be cleaned up.
        const branchExistResult = await this.host.spawnFn(
          "git",
          ["rev-parse", "--verify", "--quiet", `refs/heads/${plan.branchName}`],
          { cwd: this.host.cwd },
        );
        const branchWasPreExisting = (branchExistResult.exitCode ?? 1) === 0;

        const worktreePath = await this.host.manager.create(
          this.host.cwd, slug, jobId, plan.checkpointRef, plan.branchName, setupPlan, branchWasPreExisting,
        );

        const workspace: WorkspaceContext = {
          cwd: worktreePath,
          worktreePath,
          branch: plan.branchName,
        };
        this.host.registerWorkspace(workspace);

        // Write liveness sidecar with pid=null (attach does not own the process)
        await this.host.writeLivenessSidecar(slug, jobId, worktreePath, null);

        return workspace;
      }

      case "new-run": {
        // Pass branchName so manager creates the branch in the worktree (D1)
        const setupPlan = this.host.resolveSetupPlan();
        const worktreePath = await this.host.manager.create(
          this.host.cwd, slug, jobId, plan.remoteBaseRef, plan.branchName, setupPlan,
        );

        // workspace must be registered before updateJobState so slugStoreOpts() works (invariant 1)
        const workspaceCtx: WorkspaceContext = {
          cwd: worktreePath,
          worktreePath,
          branch: plan.branchName,
        };
        this.host.registerWorkspace(workspaceCtx);

        // Seed slug store with bootstrap state before updateJobState (T-02, invariant 2)
        const slugOpts = { slug, stateRoot: worktreePath };
        if (opts?.bootstrapState) {
          await new JobStateStore(jobId, this.host.cwd, slugOpts).persist(opts.bootstrapState);
        }

        // Record worktreePath in state (slug-based store) and write liveness sidecar
        await this.host.updateJobState(jobId, (s) => ({ ...s, worktreePath }), slugOpts);
        await this.host.writeLivenessSidecar(slug, jobId, worktreePath);

        // Copy request.md into the change folder so the agent can read it
        if (opts?.requestFilePath) {
          // Only copy request.md into the change folder (no canonical path copy)
          const changeFolderRequestPath = path.join(worktreePath, changeFolderPath(slug), "request.md");
          await fs.mkdir(path.dirname(changeFolderRequestPath), { recursive: true });
          await rejectSymlink(opts.requestFilePath);
          await fs.cp(opts.requestFilePath, changeFolderRequestPath);

          // Stage the change folder request.md
          const gitAddChangeFolderResult = await this.host.spawnFn(
            "git",
            ["add", path.join(changeFolderPath(slug), "request.md")],
            { cwd: worktreePath },
          );
          if (gitAddChangeFolderResult.exitCode !== 0) {
            // Cleanup worktree before propagating error (invariant 3)
            await this.host.manager.remove(worktreePath, this.host.cwd).catch(() => {});
            await this.host.manager.prune(this.host.cwd).catch(() => {});
            throw new Error(`Failed to stage change folder request.md: ${gitAddChangeFolderResult.stderr.trim()}`);
          }

          // Copy draft's usage.json into the change folder (silent no-op if absent)
          await copyDraftUsageToChangeFolder(opts.requestFilePath, worktreePath, slug, this.host.spawnFn);

          // Also copy rules.md into the change folder so agents can read project disciplines
          await copyRulesToChangeFolder(worktreePath, slug, this.host.spawnFn);

          // Update state.request.path to point to the permanent copy (not the draft)
          // In slug mode, request.path is derived from convention at load time — this persist is a no-op for path field.
          await this.host.updateJobState(jobId, (s) => ({
            ...s,
            request: { ...s.request, path: changeFolderRequestPath },
          }), { slug, stateRoot: worktreePath });

          // Commit change folder request.md and rules.md as the first commit on the feature branch (D2)
          const gitCommitResult = await this.host.spawnFn(
            "git",
            ["commit", "-m", `add request.md for ${slug}`],
            { cwd: worktreePath },
          );
          if (gitCommitResult.exitCode !== 0) {
            // Cleanup worktree before propagating error (invariant 3)
            await this.host.manager.remove(worktreePath, this.host.cwd).catch(() => {});
            await this.host.manager.prune(this.host.cwd).catch(() => {});
            throw new Error(`Failed to commit request file: ${gitCommitResult.stderr.trim()}`);
          }
        }

        // Record branchName in state so downstream steps can use it (D3)
        const branchName = plan.branchName;
        if (branchName) {
          await this.host.updateJobState(
            jobId,
            (s) => ({ ...s, branch: branchName }),
            { slug, stateRoot: worktreePath },
          );
        }

        return workspaceCtx;
      }
    }
  }
}
