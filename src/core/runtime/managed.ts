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
import type { JobState, RequestInfo, RepositoryInfo } from "../../state/schema.js";
import { toStepName } from "../step/step-names.js";
import { transitionJob } from "../../state/lifecycle.js";
import type { SpawnFn } from "../../util/spawn.js";
import { spawnCommand } from "../../util/spawn.js";
import { createTransportAuth } from "../../git/transport-auth.js";
import { JobStateStore, buildInitialJobState } from "../../store/job-state-store.js";
import { changeFolderPath, managedMarkerPath, localSidecarDir } from "../../util/paths.js";
import { copyRulesToChangeFolder, copyDraftUsageToChangeFolder, recopyDraftToChangeFolder, rejectSymlink } from "../artifact/copy-artifacts.js";
import type { RealRuntimeStrategy, QueryOptions, WorkspaceOptions, WorkspaceContext, CleanupHandle, RequiredInput, FindingRef, MainCheckoutGuardSnapshot, WorktreeInspectionResult } from "../port/runtime-strategy.js";
import type { ArtifactRef } from "../../store/event-journal.js";
import type { OutputContract, OutputCheckResult } from "../port/output-contract.js";
import { parseIncompleteTaskLabels, evaluateContentFormatChecks } from "../step/output-verify.js";
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

/**
 * Detect whether a parsed JSON value is a GitHub API directory listing.
 * GitHub API returns a JSON array of entries, each with `name` and `type` fields,
 * when the requested path is a directory.
 *
 * Returns false for empty arrays and plain non-object arrays (e.g. JSON array files).
 */
export function isGitHubDirectoryListing(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  const first = value[0] as Record<string, unknown>;
  return (
    typeof first === "object" &&
    first !== null &&
    typeof first["name"] === "string" &&
    typeof first["type"] === "string"
  );
}

export class ManagedRuntime implements RealRuntimeStrategy {
  private readonly spawnFn: SpawnFn;
  private readonly wrappedSpawnFn: SpawnFn;
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
    const transportAuth = createTransportAuth({ token: githubToken, cwd });
    this.wrappedSpawnFn = transportAuth.wrapSpawn(this.spawnFn);
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
   * D1: Private helper — managed machine-local store rooted at .specrunner/local/<slug>/.
   * Uses changeDir seam (not slug-mode) so persist writes full state without stripping
   * machine-local fields (pid / session / request.slug / request.path).
   */
  private managedLocalStore(jobId: string, slug: string): JobStateStore {
    return new JobStateStore(jobId, this.cwd, {
      changeDir: path.join(this.cwd, localSidecarDir(slug)),
    });
  }

  /**
   * Update job state atomically: load → mutate → persist.
   * Replaces the deprecated updateJobState() from state/store.ts.
   */
  private async updateJobState(jobId: string, mutator: (s: JobState) => JobState): Promise<void> {
    const store = this.managedLocalStore(jobId, this.currentSlug!);
    const current = await store.load();
    const updated = mutator(current as JobState);
    await store.persist(updated);
  }

  /**
   * Bootstrap a new job: pure in-memory (no I/O).
   * Managed runtime defers persistence to setupWorkspace() run path (D3),
   * which seeds opts.bootstrapState into .specrunner/local/<slug>/ after
   * the slug is authoritatively known.
   */
  async bootstrapJob(
    _repoRoot: string,
    params: { request: RequestInfo; repository: RepositoryInfo; pipelineId?: string },
  ): Promise<JobState> {
    return buildInitialJobState(params);
  }

  /**
   * Persist job state to the machine-local slug store (.specrunner/local/<slug>/).
   */
  async persistJobState(
    jobId: string,
    slug: string,
    _workspace: import("../port/runtime-strategy.js").WorkspaceContext | null,
    state: JobState,
  ): Promise<void> {
    await this.managedLocalStore(jobId, slug).persist(state);
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
      // Resume: recopy draft request.md into change folder (copy semantics)
      await recopyDraftToChangeFolder(this.cwd, this.cwd, slug, this.spawnFn);
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
    const pushBranchResult = await this.wrappedSpawnFn(
      "git",
      ["push", "origin", branchName],
      { cwd: this.cwd },
    );
    if (pushBranchResult.exitCode !== 0) {
      throw new Error(
        `git push origin ${branchName} failed (exit ${pushBranchResult.exitCode}): ${pushBranchResult.stderr.trim()}`,
      );
    }

    // D3: Seed bootstrapState to .specrunner/local/<slug>/ before any updateJobState.
    // Establishes state.json + events.jsonl so subsequent load() in updateJobState succeeds.
    // Skip when bootstrapState is absent (defensive; pipeline-run always provides it on run path).
    if (opts?.bootstrapState) {
      await this.managedLocalStore(jobId, slug).persist(opts.bootstrapState);
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
      const pushCommitResult = await this.wrappedSpawnFn(
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
   * D5: { slug, jobId, createdAt } — pure index, no status field.
   * Best-effort: silently swallows errors to avoid blocking workspace setup.
   */
  private async writeManagedMarker(slug: string, jobId: string): Promise<void> {
    try {
      const markerAbsPath = path.join(this.cwd, managedMarkerPath(slug));
      await fs.mkdir(path.dirname(markerAbsPath), { recursive: true });
      await fs.writeFile(
        markerAbsPath,
        JSON.stringify({ slug, jobId, createdAt: new Date().toISOString() }, null, 2),
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
      storeFactory: (id: string) => this.managedLocalStore(id, slug),
      runtimeStrategy: this,
    };
  }

  // ---------------------------------------------------------------------------
  // Step artifact lifecycle (B-8 seam) — managed: all no-ops
  // ---------------------------------------------------------------------------

  async captureHeadSha(_cwd: string): Promise<string | null> {
    return null;
  }

  /**
   * No-op: managed runtime has no local worktree to inspect.
   * Returns null so executor skips drift detection.
   */
  async snapshotMainCheckoutGuard(_cwd: string, _config: import("../../config/schema.js").SpecRunnerConfig): Promise<MainCheckoutGuardSnapshot | null> {
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

  /**
   * D5: no-op for managed runtime — cloud agent manages branch state independently.
   */
  async commitFinalState(_deps: unknown, _state: unknown): Promise<void> {
    // no-op
  }

  async verifyFindingRefs(refs: FindingRef[], _cwd: string, branch: string | null): Promise<FindingRef[]> {
    if (refs.length === 0) return [];
    // branch is required to look up files via GitHub API
    if (!branch) return [...refs];

    const nonExistent: FindingRef[] = [];
    for (const ref of refs) {
      const content = await this.githubClient.getRawFile(
        this.repo.owner,
        this.repo.name,
        branch,
        ref.file,
      );
      if (content === null) {
        nonExistent.push(ref);
        continue;
      }
      // Detect directory: GitHub API returns a JSON array of entries, each with `name` and `type` fields
      let isDirectory = false;
      try {
        const parsed: unknown = JSON.parse(content);
        if (isGitHubDirectoryListing(parsed)) {
          isDirectory = true;
        }
      } catch {
        // Not JSON — treat as regular file content
      }
      if (isDirectory) {
        if (ref.line !== undefined) {
          nonExistent.push(ref);
        }
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
   * Validate declared step output contracts after the agent session completes.
   * No-throw — returns OutputCheckResult with violations.
   * Empty contracts → empty result.
   *
   * Fetches origin/<branch> first (stdout-clean) to ensure latest refs are available.
   * branch null → all contracts treated as violations.
   */
  async validateStepOutputs(
    contracts: OutputContract[],
    cwd: string,
    branch: string | null,
  ): Promise<OutputCheckResult> {
    if (contracts.length === 0) return { violations: [] };

    // Fetch to ensure latest remote refs are available (stdout-clean, failure ignored).
    if (branch) {
      await this.wrappedSpawnFn("git", ["fetch", "origin", branch], { cwd }).catch(() => {});
    }

    const violations: import("../port/output-contract.js").OutputViolation[] = [];
    for (const contract of contracts) {
      if (!branch) {
        // No branch available — cannot verify remote content
        violations.push({ kind: contract.kind, path: contract.path, policy: contract.policy, detail: [] });
        continue;
      }

      if (contract.kind === "produced") {
        const content = await this.githubClient.getRawFile(
          this.repo.owner, this.repo.name, branch, contract.path,
        );
        const isViolation =
          content === null ||
          content.trim().length === 0 ||
          (contract.scaffold !== undefined && content === contract.scaffold);
        if (isViolation) {
          violations.push({ kind: contract.kind, path: contract.path, policy: contract.policy, detail: [] });
        }
      } else if (contract.kind === "tasks-complete") {
        const content = await this.githubClient.getRawFile(
          this.repo.owner, this.repo.name, branch, contract.path,
        );
        if (content === null) {
          violations.push({ kind: contract.kind, path: contract.path, policy: contract.policy, detail: [] });
          continue;
        }
        const incomplete = parseIncompleteTaskLabels(content);
        if (incomplete.length > 0) {
          violations.push({ kind: contract.kind, path: contract.path, policy: contract.policy, detail: incomplete });
        }
      } else if (contract.kind === "content-format") {
        const content = await this.githubClient.getRawFile(
          this.repo.owner, this.repo.name, branch, contract.path,
        );
        // content === null means file missing — evaluateContentFormatChecks will fail all checks
        const failedLabels = evaluateContentFormatChecks(content, contract.checks ?? []);
        if (failedLabels.length > 0) {
          violations.push({ kind: contract.kind, path: contract.path, policy: contract.policy, detail: failedLabels });
        }
      } else if (contract.kind === "test-coverage") {
        // ManagedRuntime does not have access to a local worktree for running file-system
        // scans (collectProjectTestFiles requires local fs). Skip without violation,
        // consistent with digestArtifacts returning hash: null for managed (best-effort only).
        // The local runtime enforces this contract authoritatively.
      }
    }
    return { violations };
  }

  async validateStepInputs(inputs: RequiredInput[], cwd: string, branch: string | null): Promise<void> {
    if (inputs.length === 0) return;

    // Fetch origin branch to ensure latest refs are available (stdout not emitted).
    // Ignore fetch errors — cat-file will catch missing refs below.
    if (branch) {
      await this.wrappedSpawnFn("git", ["fetch", "origin", branch], { cwd }).catch(() => {});
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

  /**
   * Managed runtime has no local filesystem for agent outputs.
   * Returns hash: null for every ref (paths are preserved for lineage records).
   * Never throws — per best-effort lineage contract.
   */
  async digestArtifacts(refs: { path: string }[], _cwd: string, _branch: string | null): Promise<ArtifactRef[]> {
    return refs.map((ref) => ({ path: ref.path, hash: null }));
  }

  /**
   * Managed runtime has no local git worktree — changed files cannot be derived.
   *
   * Returns {kind:"unavailable"} as a structural limitation: the absence of a local
   * worktree means git diff cannot be run, not that nothing changed.
   *
   * The reviewer activation gate and scope-check consult `canDeriveChangedFiles()` before
   * calling this method. When `canDeriveChangedFiles()` returns `false`, both short-circuit
   * and do NOT call `listChangedFiles`. The `unavailable` result is returned here for
   * completeness and for consumers that do not check the predicate (e.g. round-invalidation,
   * no-op-detect treat unavailable as empty for behavior-preservation).
   */
  async listChangedFiles(
    _baseBranch: string,
    _cwd: string,
    _branch: string | null,
  ): Promise<import("../port/runtime-strategy.js").ChangedFilesResult> {
    return { kind: "unavailable", reason: "managed runtime cannot derive changed files (no local worktree)" };
  }

  /**
   * ManagedRuntime cannot derive changed files — no local git worktree is available.
   * Returns `false` — both scope-check and the reviewer activation gate consume this
   * predicate as fail-closed signals:
   *   - scope-check synthesizes an UNKNOWN finding instead of calling `listChangedFiles`.
   *   - The activation gate activates `paths`-conditioned reviewers (fail-closed) rather
   *     than silently skipping them on an unverifiable path condition.
   */
  canDeriveChangedFiles(): boolean {
    return false;
  }

  /** Out of scope for the duplicate-live-job guard (managed uses marker.json). No-op. */
  async assertNoDuplicateLiveJob(_repoRoot: string, _slug: string): Promise<void> {
    // no-op
  }

  /**
   * No local worktree available — always returns success with empty paths.
   * Parallel custom reviewer managed support is a known Non-Goal; no local git
   * state means the coordinator cannot detect worktree changes. Returning
   * success:[] (not unavailable) reflects the structural fact that managed
   * members do not write to a local worktree — worktree absence is not a
   * failure, it is the known design constraint for managed runtime.
   *
   * D3 (round-owned-git-effects): managed parallel is Non-Goal; worktree is absent by design.
   */
  async listWorktreeChanges(_cwd: string): Promise<WorktreeInspectionResult> {
    return { kind: "success", paths: [] };
  }

  /**
   * No local worktree available — no-op.
   * Parallel custom reviewer managed support is a known Non-Goal.
   *
   * D3 (round-owned-git-effects): fail-safe for managed runtime.
   */
  async commitRoundArtifacts(
    _stagePaths: string[],
    _cwd: string,
    _branch: string,
    _coordinatorName: string,
    _slug: string,
    _commitPushInfra: unknown,
  ): Promise<void> {
    // no-op: no local worktree
  }

  registerCleanup(jobId: string, startStep: string): CleanupHandle {
    const slug = this.currentSlug;

    const signalCleanup = async (): Promise<void> => {
      try {
        if (!slug) return; // best-effort skip: slug not set, cannot resolve managed store
        const store = this.managedLocalStore(jobId, slug);
        const current = await store.load();
        const { state: updated } = transitionJob(current as JobState, "awaiting-resume", {
          trigger: "signal-handler",
          reason: "Interrupted by signal",
          patch: {
            pid: null,
            resumePoint: {
              step: toStepName(startStep),
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
