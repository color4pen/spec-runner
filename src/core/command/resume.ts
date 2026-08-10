/**
 * ResumeCommand: CommandRunner for the `specrunner resume` command.
 *
 * Design D7: prepare() resolves job state, checks safety gates, determines
 * start step, and transitions job to "running" status.
 */
import * as nodePath from "node:path";
import { loadConfig } from "../../config/store.js";
import { resolveRepoRoot } from "../../util/repo-root.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { loadStateByJobId } from "../job-access/load-by-job-id.js";
import { resolveStateStoreByJobId } from "../job-access/resolve-state-store.js";
import { logInfo, setLogLevel, logError, stderrWrite, type LogLevel } from "../../logger/stdout.js";
import { SpecRunnerError, ERROR_CODES, worktreeGuardError } from "../../errors.js";
import type { JobState, StepName } from "../../state/schema.js";
import { appendSynthesizedCommit, appendOperatorAdjudication } from "../../state/schema.js";
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
import type { SpecRunnerConfig } from "../../config/schema.js";
import type { IssueFidelityComparator } from "../port/issue-fidelity-comparator.js";
import { detectSpecrunnerWorktree } from "../worktree/detection.js";
import { resolveLivenessWorktreePath } from "../resume/resolve-worktree-path.js";
import { detectCanonDirtyPaths, commitOperatorCanon } from "../resume/apply-canon.js";
import { isInterruptionBacked, declaredCanonWritesForStep, isInterruptedStepPartialCanon } from "../resume/canon-provenance.js";
import { detectUnadoptedCommits, buildAdoptEscalationMessage, buildAdoptionHaltMessage, type UnadoptedCommit } from "../resume/adopt-commits.js";
import { reconcileWorktreeArtifacts, quarantinePartialCanon } from "../resume/reconcile-worktree.js";
import { defaultSpawnFn, runSubprocess } from "../../util/git-exec.js";
import type { StepDeps } from "../step/types.js";

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
  /** When true, adopt publish-range commits not in the ledger into synthesizedCommits before resuming. */
  adoptCommits?: boolean;
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
 * Preflight adopt-detection + unified fail-closed halt for Gate 1.
 *
 * Called when dirty protected canon paths are detected and the fail-closed path is taken
 * (auto-quarantine not applicable). Runs detectUnadoptedCommits read-only (no git commits,
 * no ledger writes) to give the operator all required flags in a single halt message.
 *
 * Exit-128 (non-git cwd) is treated as empty range (same carve-out as Gate 2).
 * Any other detection failure is reported as commitDetectionFailed=true (fail-closed).
 *
 * Always throws PrepareError(1).
 */
async function haltWithCanonPreflight(
  slug: string,
  worktreePath: string,
  dirtyCanonPaths: string[],
  state: { synthesizedCommits?: string[] | null },
): Promise<never> {
  let preflightCommits: UnadoptedCommit[] = [];
  let preflightFailed = false;
  try {
    preflightCommits = await detectUnadoptedCommits(
      worktreePath, state.synthesizedCommits ?? [], defaultSpawnFn,
    );
  } catch (preflightErr) {
    const preflightMsg = (preflightErr as Error).message ?? "";
    if (!preflightMsg.includes("exit 128")) {
      preflightFailed = true;
    }
    // exit 128 → non-git cwd → treat as empty range (preflightCommits stays [])
  }

  const haltMsg = buildAdoptionHaltMessage({
    slug,
    dirtyCanonPaths,
    unadoptedCommits: preflightCommits,
    commitDetectionFailed: preflightFailed,
  });

  logError(`Protected canon paths are dirty in the worktree: ${dirtyCanonPaths.join(", ")}`);
  stderrWrite(haltMsg);
  throw new PrepareError(1, "Protected canon paths are dirty; use --apply-canon or discard");
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
    comparatorFactory?: (config: SpecRunnerConfig) => IssueFidelityComparator,
  ) {
    super(runtime, events, comparatorFactory);
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
        // resolveJobStateBySlug returns null for terminal-only slugs.
        // Before falling back to resolveId, check if this slug has any terminal jobs so we can
        // show the appropriate "cannot transition to 'running'" message rather than "not found".
        const allStates = await JobStateStore.list(cwd, { includeArchived: false });
        const terminalForSlug = allStates.filter(
          (s) => getJobSlug(s) === this.slug,
        );
        if (terminalForSlug.length > 0) {
          // Pick the most recently updated terminal job and show the transition error
          const terminalState = terminalForSlug.sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          )[0]!;
          logError(`Job '${this.slug}' has status '${terminalState.status}', cannot transition to 'running'.`);
          throw new PrepareError(1, `Cannot resume from status '${terminalState.status}'`);
        }

        // Slug not found — try resolving as short Job ID prefix
        let fullId: string;
        try {
          fullId = await JobStateStore.resolveId(cwd, this.slug);
        } catch (err) {
          if (err instanceof SpecRunnerError && err.code === ERROR_CODES.JOB_NOT_FOUND) {
            // Neither slug nor job ID prefix matched — report in slug vocabulary.
            logError(`Job not found: no active job with slug or job ID prefix '${this.slug}'`);
            if (err.hint) stderrWrite(`Hint: ${err.hint}`);
          } else if (err instanceof SpecRunnerError) {
            // Other resolution failures (e.g. ambiguous prefix) keep their own message.
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
    // Evaluate stale-running once and store the result so it can be used in the apply-canon
    // provenance check later (SIGKILL / hard-crash path: no resumePoint, stale process).
    // The real isStaleRunning returns false for non-"running" status; tests mock its return value
    // to control staleRunningDetected in the apply-canon gate.
    const staleRunningDetected = isStaleRunning(state, sidecarPath);
    if (state.status === "running") {
      if (staleRunningDetected) {
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

      // Persist operator adjudication when --prompt is provided (non-empty string only).
      // The one-shot deps injection (resumePrompt → pipeline.ts <resume-context>) is unchanged.
      const stateToWrite: JobState = (this.options.prompt && this.options.prompt.length > 0)
        ? appendOperatorAdjudication(transitioned, {
            text: this.options.prompt,
            step: startStep,
            recordedAt: new Date().toISOString(),
          })
        : transitioned;

      if (this.options.noWorktree) {
        // no-worktree mode: state.json lives in cwd (no worktree path to find)
        // Do NOT capture runStore here — no-worktree uses a dedicated store for initial persist only.
        // Prefer resolveStateStoreByJobId (sidecar lookup; also works in mocked test environments);
        // fall back to direct construction when no sidecar entry exists (real no-worktree usage).
        const slug = getJobSlug(stateToWrite) ?? this.slug;
        const noWorktreeStore = await resolveStateStoreByJobId(cwd, stateToWrite.jobId)
          ?? new JobStateStore(stateToWrite.jobId, cwd, { slug, stateRoot: cwd });
        await noWorktreeStore.persist(stateToWrite);
      } else {
        runStore = await resolveStateStoreByJobId(cwd, state.jobId);
        if (runStore) await runStore.persist(stateToWrite);
      }
      updatedState = stateToWrite;
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
    const resolvedWorktreePath = await resolveLivenessWorktreePath(updatedState, resolvedSlug ?? "", cwd);

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
          // D5: operator --apply-canon takes priority over auto-quarantine.
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
          // D1: check provenance before falling through to fail-closed halt.
          // Condition 1 (D2): startStep must match the interrupted step (no --from redirect).
          const interruptedStep = state.step;
          if (startStep === interruptedStep) {
            // Conditions 2/3/4: check if dirty canon is fully explained by the interrupted step.
            const minimalDeps = { slug: resolvedSlug, request, config } as StepDeps;
            const declaredCanon = declaredCanonWritesForStep(interruptedStep, updatedState, minimalDeps);
            const interruptionBacked = isInterruptionBacked(resumePoint, staleRunningDetected);
            const completedStepRunAbsent = !(state.steps?.[interruptedStep]?.length);

            if (isInterruptedStepPartialCanon({
              dirtyCanonPaths,
              declaredCanonWrites: declaredCanon,
              interruptionBacked,
              completedStepRunAbsent,
            })) {
              // D4: auto-quarantine — evidence-first, then continue (no halt).
              try {
                const qResult = await quarantinePartialCanon(
                  resolvedSlug, resolvedWorktreePath, dirtyCanonPaths, defaultSpawnFn,
                );
                logInfo(
                  `[canon-quarantine] auto-quarantined partial output of interrupted step '${interruptedStep}': ` +
                  `${qResult.reconciled.join(", ")}` +
                  (qResult.quarantineDir ? ` → 退避先: ${qResult.quarantineDir}` : ""),
                );
                // Gate passes — continue to adopt-commits and reconcile.
              } catch (err) {
                // Evidence write failed — fail-closed (nothing deleted, evidence preserved).
                logError(`Failed to quarantine partial canon output of step '${interruptedStep}': ${(err as Error).message}`);
                stderrWrite("Hint: Quarantine evidence could not be written. Check .specrunner/local/<slug>/ writability, then resume again. Canon paths have NOT been deleted.");
                throw new PrepareError(1, "Failed to quarantine partial canon output (fail-closed)");
              }
            } else {
              // Conditions 2/3/4 not fully met — preflight + unified fail-closed halt.
              await haltWithCanonPreflight(resolvedSlug, resolvedWorktreePath, dirtyCanonPaths, updatedState);
            }
          } else {
            // Condition 1 not met: --from redirects to a different step than the interrupted one.
            // Auto-quarantine must not fire (operator chose a different start point explicitly).
            // Preflight + unified fail-closed halt.
            await haltWithCanonPreflight(resolvedSlug, resolvedWorktreePath, dirtyCanonPaths, updatedState);
          }
        }
      }

      // Adopt gate: check for publish-range commits not in the synthesizedCommits ledger.
      // Runs after the apply-canon gate so that an operator-apply commit from the same resume
      // is already in the ledger (D4 composability: the apply-canon OID is not re-flagged).
      {
        const ledger = updatedState.synthesizedCommits ?? [];
        let unadoptedCommits: UnadoptedCommit[] = [];
        try {
          unadoptedCommits = await detectUnadoptedCommits(resolvedWorktreePath, ledger, defaultSpawnFn);
        } catch (err) {
          const msg = (err as Error).message ?? "";
          if (msg.includes("exit 128")) {
            // Non-git directory (e.g. test/dev environment) — treat as empty range and continue.
          } else {
            logError(`Failed to check publish range: ${msg}`);
            throw new PrepareError(1, "Failed to check publish range (fail-closed)");
          }
        }

        if (unadoptedCommits.length > 0) {
          if (this.options.adoptCommits) {
            // Adopt each unknown OID by appending it to the ledger.
            for (const commit of unadoptedCommits) {
              updatedState = appendSynthesizedCommit(updatedState, commit.oid);
            }
            // Persist is mandatory (fail-closed): a null runStore or persist failure must
            // prevent pipeline launch so the ledger is never out of sync with git history.
            if (!runStore) {
              logError("Cannot adopt commits: no state store available");
              throw new PrepareError(1, "Failed to adopt commits: no runStore");
            }
            try {
              await runStore.persist(updatedState);
            } catch (err) {
              logError(`Failed to persist adopted commits: ${(err as Error).message}`);
              throw new PrepareError(1, "Failed to adopt commits");
            }
            logInfo(`[adopt-commits] adopted ${unadoptedCommits.length} commit(s): ${unadoptedCommits.map((c) => c.shortSha).join(", ")}`);
          } else {
            // fail-closed: escalate with per-commit details and three resolution options.
            const msg = buildAdoptEscalationMessage(resolvedSlug, unadoptedCommits);
            logError(`Unknown commits in publish range: ${unadoptedCommits.map((c) => c.shortSha).join(", ")}`);
            stderrWrite(msg);
            throw new PrepareError(1, "Unknown commits in publish range; use --adopt-commits");
          }
        }
      }

      // Reconcile worktree: quarantine and remove interrupted-attempt residue.
      // Runs after the apply-canon gate (canon paths handled above) and before step start.
      // Best-effort detection: git status failure → no-op (D7).
      // Quarantine failure → fail-closed (evidence not lost, removal not attempted).
      let reconcileResult;
      try {
        reconcileResult = await reconcileWorktreeArtifacts(resolvedSlug, resolvedWorktreePath, defaultSpawnFn);
      } catch (err) {
        logError(`Failed to reconcile worktree residue: ${(err as Error).message}`);
        stderrWrite("Hint: interrupted-attempt residue was preserved and NOT removed. Check .specrunner/local/<slug>/ writability, then resume again.");
        throw new PrepareError(1, "Failed to reconcile worktree residue (fail-closed)");
      }
      if (reconcileResult.reconciled.length > 0) {
        logInfo(`[reconcile] quarantined + removed interrupted-attempt residue: ${reconcileResult.reconciled.join(", ")}` +
          (reconcileResult.quarantineDir ? ` — 退避先: ${reconcileResult.quarantineDir}` : ""));
      }
    } else {
      if (this.options.applyCanon) {
        // --apply-canon has no effect without a worktree — warn but continue.
        stderrWrite("Warning: --apply-canon has no effect without a worktree (no-worktree mode or worktree not found). Continuing normally.");
      }
      if (this.options.adoptCommits) {
        // --adopt-commits cannot check the publish range without a worktree — warn but continue.
        stderrWrite("Warning: --adopt-commits has no effect without a worktree (no-worktree mode or worktree not found). The publish range cannot be checked; commits will not be adopted.");
      }
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
