/**
 * ResumeCommand: CommandRunner for the `specrunner resume` command.
 *
 * Design D7: prepare() resolves job state, checks safety gates, determines
 * start step, and transitions job to "running" status.
 */
import * as nodePath from "node:path";
import * as nodeFs from "node:fs/promises";
import { loadConfig } from "../../config/store.js";
import { resolveRepoRoot } from "../../util/repo-root.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { loadStateByJobId } from "../job-access/load-by-job-id.js";
import { resolveStateStoreByJobId } from "../job-access/resolve-state-store.js";
import { logInfo, setLogLevel, logError, stderrWrite, type LogLevel } from "../../logger/stdout.js";
import { SpecRunnerError, worktreeGuardError } from "../../errors.js";
import type { JobState, StepName } from "../../state/schema.js";
import { appendSynthesizedCommit } from "../../state/schema.js";
import { toStepName } from "../step/step-names.js";
import { parseRequestMd } from "../../parser/request-md.js";
import { resolveJobStateBySlug } from "../resume/resolve-job.js";
import { resolveRequestPath } from "../resume/resolve-request-path.js";
import { getJobSlug } from "../../state/job-slug.js";
import { resolveResumeStep, buildAllowedStepSet, mapMemberToCoordinator } from "../resume/resolve-step.js";
import { checkConsecutiveEscalations, checkStaleState, isStaleRunning } from "../resume/safety.js";
import { livenessJsonPath } from "../../util/paths.js";
import { canTransition, transitionJob } from "../../state/lifecycle.js";
import { CommandRunner, type PrepareResult } from "./runner.js";
import type { RuntimeStrategy } from "../port/runtime-strategy.js";
import type { EventBus } from "../event/event-bus.js";
import { detectSpecrunnerWorktree } from "../worktree/detection.js";
import { detectCanonDirtyPaths, commitOperatorCanon } from "../resume/apply-canon.js";
import { defaultSpawnFn, runSubprocess } from "../../util/git-exec.js";

export interface ResumeOptions {
  from?: string;
  force?: boolean;
  logLevel?: LogLevel;
  cwd?: string;
  prompt?: string;
  json?: boolean;
  noWorktree?: boolean;
  /** When true, commit dirty protected canon paths as an operator-apply commit before resuming. */
  applyCanon?: boolean;
}

/**
 * Prepare result with additional exit code info for failure cases.
 * The exitCode field is only used when prepare() "fails" in a controlled way —
 * in which case it throws with an error containing the code.
 */
class PrepareError extends Error {
  constructor(public readonly exitCode: 1 | 2, message: string) {
    super(message);
  }
}

/**
 * CommandRunner for `specrunner resume`.
 * prepare() performs all validation and state transition before the pipeline runs.
 */
export class ResumeCommand extends CommandRunner {
  constructor(
    runtime: RuntimeStrategy,
    events: EventBus,
    private readonly slug: string,
    private readonly options: ResumeOptions = {},
  ) {
    super(runtime, events);
  }

  async execute(): Promise<number> {
    // Override execute() to support exit code 2 (argument error) from prepare()
    try {
      return await super.execute();
    } catch (err) {
      if (err instanceof PrepareError) {
        return err.exitCode;
      }
      throw err;
    }
  }

  protected async prepare(): Promise<PrepareResult> {
    const logLevel = this.options.logLevel ?? "default";
    setLogLevel(logLevel);
    const cwd = this.options.cwd ?? process.cwd();

    // Worktree guard: reject resume from inside a specrunner job worktree.
    // agent-edited config inside a worktree must not influence guard evaluation.
    {
      const wtResult = await detectSpecrunnerWorktree(cwd);
      if (wtResult.isSpecrunnerWorktree) {
        const mainPath = wtResult.mainCheckoutPath ?? "<main checkout>";
        const guardErr = worktreeGuardError("job resume", mainPath);
        logError(guardErr.message);
        stderrWrite(`Hint: ${guardErr.hint}`);
        throw new PrepareError(2, "Cannot resume from inside a worktree");
      }
    }

    // Resolve job state by slug, with short Job ID fallback
    let state: JobState;
    try {
      const resolved = await resolveJobStateBySlug(this.slug, cwd);
      if (resolved === null) {
        // Slug not found — try resolving as short Job ID prefix
        let fullId: string;
        try {
          fullId = await JobStateStore.resolveId(cwd, this.slug);
        } catch (err) {
          if (err instanceof SpecRunnerError) {
            logError(err.message);
            if (err.hint) stderrWrite(`Hint: ${err.hint}`);
          } else {
            logError((err as Error).message);
          }
          throw new PrepareError(1, "Job not found");
        }
        state = (await loadStateByJobId(cwd, fullId)) as JobState;
      } else {
        state = resolved;
      }
    } catch (err) {
      if (err instanceof PrepareError) throw err;
      logError((err as Error).message);
      throw new PrepareError(2, "Failed to resolve job");
    }

    // Status gate: stale detection for "running" state
    // Pass sidecarPath when slug is known (T-13: liveness check via sidecar)
    const resolvedSlugForSidecar = getJobSlug(state);
    const sidecarPath = resolvedSlugForSidecar
      ? nodePath.join(cwd, livenessJsonPath(resolvedSlugForSidecar))
      : undefined;
    if (state.status === "running") {
      if (isStaleRunning(state, sidecarPath)) {
        // Orphaned running state — transition to awaiting-resume and continue
        const { state: recovered } = transitionJob(state, "awaiting-resume", {
          trigger: "stale-detection",
          reason: "Process not running",
          patch: { pid: null },
        });
        if (this.options.noWorktree) {
          const slug = getJobSlug(recovered) ?? this.slug;
          const staleStore = new JobStateStore(recovered.jobId, cwd, { slug, stateRoot: cwd });
          await staleStore.persist(recovered);
        } else {
          const staleStore = await resolveStateStoreByJobId(cwd, state.jobId);
          if (staleStore) await staleStore.persist(recovered);
        }
        state = recovered;
        stderrWrite(`Warning: Job '${this.slug}' was running but the process is no longer alive. Recovering.`);
      } else {
        logError(`Job '${this.slug}' is currently running. Cannot resume a running job.`);
        throw new PrepareError(1, "Job is running");
      }
    }

    // Status gate: reject if transition to "running" is not allowed
    if (!canTransition(state.status, "running")) {
      logError(`Job '${this.slug}' has status '${state.status}', cannot transition to 'running'.`);
      throw new PrepareError(1, `Cannot resume from status '${state.status}'`);
    }

    // Safety checks
    const resumePoint = state.resumePoint ?? null;
    const startStepForCheck = resumePoint?.step ?? (state.step ? toStepName(state.step) : undefined);

    if (startStepForCheck) {
      const hasConsecutiveEscalations = checkConsecutiveEscalations(state, startStepForCheck);
      if (hasConsecutiveEscalations && !this.options.force) {
        logError(`Step '${startStepForCheck}' has escalated 3 consecutive times. Use --force to override.`);
        throw new PrepareError(1, "Consecutive escalations");
      }
    }

    if (checkStaleState(state)) {
      stderrWrite(`Warning: Job '${this.slug}' was last updated more than 24 hours ago. The branch may have drifted.`);
    }

    // Resume step resolution: --from > resumePoint.step > state.step (hard-crash fallback)
    let startStep: StepName;
    try {
      const allowedSteps = buildAllowedStepSet(state.reviewers);
      startStep = resolveResumeStep(this.options.from, resumePoint, state.step, allowedSteps, state.reviewers);
    } catch (err) {
      logError((err as Error).message);
      throw new PrepareError(1, "Failed to resolve resume step");
    }

    logInfo(`Resuming job '${this.slug}' from step '${startStep}'`);

    // Parse request.md before committing to "running" state
    // resolveRequestPath handles legacy state files where request.path points to a deleted draft
    const resolvedSlug = getJobSlug(state);
    const resolvedPath = resolveRequestPath(state.request.path, resolvedSlug, state.worktreePath, cwd);
    let request;
    try {
      request = await parseRequestMd(resolvedPath);
    } catch (err) {
      logError(`Failed to read request.md at '${resolvedPath}': ${(err as Error).message}`);
      throw new PrepareError(1, "Failed to parse request.md");
    }

    // State preparation: transition to "running"
    let updatedState: JobState;
    let runStore: JobStateStore | null = null;
    try {
      const { state: transitioned } = transitionJob(state, "running", {
        trigger: "resume",
        reason: `Resuming from step '${startStep}'`,
        patch: { error: null, resumePoint: null, mainCheckoutDrift: null, pid: process.pid },
      });
      if (this.options.noWorktree) {
        // no-worktree mode: state.json lives in cwd (no worktree path to find)
        // Do NOT capture runStore here — no-worktree uses a dedicated store for initial persist only.
        // Prefer resolveStateStoreByJobId (sidecar lookup; also works in mocked test environments);
        // fall back to direct construction when no sidecar entry exists (real no-worktree usage).
        const slug = getJobSlug(transitioned) ?? this.slug;
        const noWorktreeStore = await resolveStateStoreByJobId(cwd, transitioned.jobId)
          ?? new JobStateStore(transitioned.jobId, cwd, { slug, stateRoot: cwd });
        await noWorktreeStore.persist(transitioned);
      } else {
        runStore = await resolveStateStoreByJobId(cwd, state.jobId);
        if (runStore) await runStore.persist(transitioned);
      }
      updatedState = transitioned;
    } catch (err) {
      logError(`Failed to update job state: ${(err as Error).message}`);
      throw new PrepareError(1, "Failed to update state");
    }

    // Load config with project local overlay (resolve repo root from cwd first)
    let config;
    try {
      const repoRoot = await resolveRepoRoot(cwd);
      config = await loadConfig(repoRoot ?? undefined);
    } catch (err) {
      if (err instanceof SpecRunnerError) {
        logError(err.message);
        if (err.hint) stderrWrite(`Hint: ${err.hint}`);
      } else {
        logError((err as Error).message);
      }
      throw new PrepareError(1, "Failed to load config");
    }

    // Resolve existing worktree path: prefer state field, fall back to liveness sidecar (T-09).
    // In slug-mode, state.worktreePath is stripped from branch-coupled state.json.
    // The sidecar (.specrunner/local/<slug>/liveness.json) stores the machine-local value.
    let resolvedWorktreePath: string | null = updatedState.worktreePath ?? null;
    if (!resolvedWorktreePath && resolvedSlug) {
      try {
        const sidecarAbsPath = nodePath.join(cwd, livenessJsonPath(resolvedSlug));
        const raw = await nodeFs.readFile(sidecarAbsPath, "utf-8");
        const sidecar = JSON.parse(raw) as Record<string, unknown>;
        if (
          typeof sidecar["worktreePath"] === "string" &&
          sidecar["jobId"] === updatedState.jobId
        ) {
          resolvedWorktreePath = sidecar["worktreePath"];
        }
      } catch {
        // No sidecar or mismatch — will create a new worktree on resume
      }
    }

    // Apply-canon gate: check for dirty protected canon paths before starting the step.
    // Only runs when a worktree is available (resolvedWorktreePath non-null) and the slug is known.
    if (resolvedWorktreePath !== null && resolvedSlug !== null) {
      let dirtyCanonPaths: string[] = [];
      try {
        dirtyCanonPaths = await detectCanonDirtyPaths(resolvedSlug, resolvedWorktreePath, defaultSpawnFn);
      } catch (err) {
        const msg = (err as Error).message ?? "";
        if (msg.includes("exit 128")) {
          // worktreePath is not inside a git repository (e.g. a test or in-development environment).
          // A non-git directory cannot have git-dirty files; treat as clean and continue.
        } else {
          logError(`Failed to detect dirty canon paths: ${msg}`);
          stderrWrite("Hint: Use --apply-canon to commit protected canon changes as an operator-apply commit, or discard them (git checkout HEAD -- <path>) before resuming.");
          throw new PrepareError(1, "Failed to detect dirty canon paths (fail-closed)");
        }
      }

      if (dirtyCanonPaths.length > 0) {
        if (this.options.applyCanon) {
          // Commit dirty canon paths as an operator-apply commit and record OID in ledger.
          let committedOid: string | null = null;
          try {
            const oid = await commitOperatorCanon(resolvedSlug, resolvedWorktreePath, dirtyCanonPaths, defaultSpawnFn);
            committedOid = oid;
            updatedState = appendSynthesizedCommit(updatedState, oid);
            if (runStore) await runStore.persist(updatedState);
            logInfo(`[apply-canon] operator-apply commit ${oid} (paths: ${dirtyCanonPaths.join(", ")})`);
          } catch (err) {
            // Split-brain guard (cross-boundary Finding 3): if the commit was created but
            // the ledger persist failed, an OID would exist in git history without a ledger
            // entry — the next resume would see clean canon, skip this gate, and the step's
            // egress check would halt with EGRESS_UNKNOWN_COMMIT (recoverable only via the
            // manual-push tribal knowledge this feature removes). Roll the commit back with
            // a mixed reset: the operator's canon edits return to the worktree as dirty
            // files, and the retry re-runs this gate from a consistent state.
            if (committedOid !== null) {
              const resetResult = await runSubprocess(defaultSpawnFn, "git", ["reset", "--mixed", "HEAD~1"], { cwd: resolvedWorktreePath });
              if (resetResult.exitCode !== 0) {
                logError(
                  `Failed to roll back operator-apply commit ${committedOid} after persist failure ` +
                  `(git reset exit ${resetResult.exitCode}). Manual recovery: push the branch, then resume.`,
                );
              } else {
                logInfo(`[apply-canon] rolled back operator-apply commit ${committedOid}; canon edits preserved in worktree — retry resume --apply-canon`);
              }
            }
            logError(`Failed to create operator-apply commit: ${(err as Error).message}`);
            throw new PrepareError(1, "Failed to create operator-apply commit");
          }
        } else {
          // fail-closed: do not start the step; require operator to make an explicit choice.
          logError(`Protected canon paths are dirty in the worktree: ${dirtyCanonPaths.join(", ")}`);
          stderrWrite(`Hint: Use --apply-canon to commit these changes as an operator-apply commit, or discard them (git checkout HEAD -- <path>) before resuming.`);
          throw new PrepareError(1, "Protected canon paths are dirty; use --apply-canon or discard");
        }
      }
    } else if (this.options.applyCanon) {
      // --apply-canon has no effect without a worktree — warn but continue.
      stderrWrite("Warning: --apply-canon has no effect without a worktree (no-worktree mode or worktree not found). Continuing normally.");
    }

    return {
      jobState: updatedState,
      startStep,
      request,
      config,
      slug: this.slug,
      logLevel,
      repoRoot: cwd,
      workspaceOpts: {
        existingWorktreePath: resolvedWorktreePath,
        baseBranch: request.baseBranch,
        bootstrapState: updatedState,
        noWorktree: this.options.noWorktree,
      },
      // Automatic resume context is only valid when we actually resume from the recorded step.
      // `--from` can intentionally redirect execution to a different start step.
      //
      // D3 (round-immutable-input): when resumePoint.step is a reviewer member name,
      // resolveResumeStep maps it to the coordinator (e.g. "cross-boundary-invariants" →
      // "custom-reviewers"). Apply the same mapping here so the gate still passes even
      // after member→coordinator routing. The resumePoint itself is preserved with the
      // original member step name so that automatic context routing inside the round works.
      resumeContext: (() => {
        if (!resumePoint) return undefined;
        const mappedResumeStep = mapMemberToCoordinator(resumePoint.step, updatedState.reviewers);
        return startStep === mappedResumeStep ? { resumePoint } : undefined;
      })(),
      resumePrompt: this.options.prompt,
      json: this.options.json ?? false,
    };
  }
}
