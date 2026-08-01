/**
 * No-op detection for producer steps (executor-bloat guard).
 *
 * Delegates the no-op detection check from runAgentStep so that executor.ts
 * stays lean. Follows the same sibling-file pattern as scope-check.ts.
 *
 * Design: detectNoOp is a free async function that takes an injectable
 * RuntimeStrategy seam — no direct fs I/O.
 */
import type { AgentStep } from "./types.js";
import type { Verdict } from "../../state/schema.js";
import type { RuntimeStrategy } from "../port/runtime-strategy.js";
import { stderrWrite } from "../../logger/stdout.js";

/** Worktree-relative path prefixes that are pipeline artifacts, not source changes. */
const ARTIFACT_PREFIXES = ["specrunner/changes/", ".specrunner/"] as const;

/**
 * Detect a no-op agent step completion: the session succeeded but produced
 * no source file changes (only pipeline artifact writes such as events.jsonl,
 * state.json, usage.json).
 *
 * Returns "needs-fix" when a no-op is detected; undefined otherwise.
 *
 * Preconditions (caller must check before calling):
 * - step.noOpDetect === true
 * - runtimeStrategy is available (local runtime)
 * - headBeforeStep is non-null (git SHA captured before the step ran)
 * - completionReason === "success" (not a timeout or hard error)
 *
 * listChangedFiles(headBeforeStep, …) is called after finalizeStepArtifacts
 * has run (commit + push), so it captures the step's own commits.
 */
export async function detectNoOp(
  step: AgentStep,
  runtimeStrategy: RuntimeStrategy,
  params: {
    headBeforeStep: string;
    cwd: string;
    branch: string | null;
    completionReason: string;
    /**
     * When true, a source-unchanged run is a legitimate no-op (approved
     * findings-routing path — no mandatory findings exist) and must NOT be
     * escalated. Caller computes this via codeReviewFindingsRoutingActive.
     * Omitting or passing false preserves the #734 escalation behaviour.
     */
    findingsRoutingApproved?: boolean;
    /**
     * Worktree-relative paths named by the findings routed to this fixer run
     * (exempt candidates). Changes to these paths are counted as real work even
     * when they fall under an ARTIFACT_PREFIX.
     *
     * Caller (executor) derives this from collectRoutedFixerFindings(state).map(f => f.file)
     * when step.noOpDetect === true, so it is always machine-derived — never agent
     * self-reported.
     *
     * exempt = findingTargetPaths − pipelineManagedPaths.
     * Omitting (or passing []) preserves the existing behaviour (exempt = ∅).
     */
    findingTargetPaths?: string[];
    /**
     * Pipeline-managed paths that cap the exemption. Even when a finding names one
     * of these paths, it is NOT counted as real work — the pipeline writes these
     * files itself (state.json, events.jsonl, usage.json, etc.) and they carry no
     * evidence of fixer effort.
     *
     * Caller passes pipelineManagedPaths(deps.slug).
     * Omitting (or passing []) leaves the cap empty (no additional restriction).
     */
    pipelineManagedPaths?: string[];
  },
): Promise<Verdict | undefined> {
  if (!step.noOpDetect) return undefined;
  if (params.completionReason !== "success") return undefined;

  const result = await runtimeStrategy.listChangedFiles(
    params.headBeforeStep,
    params.cwd,
    params.branch,
  );

  // Behavior preservation: unavailable (managed runtime, local transient failure) is
  // treated as empty (no-signal). This keeps the no-op escalation direction safe.
  const changedFiles = result.kind === "success" ? result.files : [];

  // Filter out artifact files — only source file changes count as real work.
  // Finding-target exemption: paths named by routed findings are exempt from artifact
  // prefix exclusion (they count as work), unless they are also pipelineManagedPaths.
  // exempt = findingTargetPaths − pipelineManagedPaths. Omitting either param → exempt = ∅.
  const managed = new Set(params.pipelineManagedPaths ?? []);
  const exempt = new Set((params.findingTargetPaths ?? []).filter((f) => !managed.has(f)));
  const sourceFiles = changedFiles.filter((f) =>
    exempt.has(f) ? true : !ARTIFACT_PREFIXES.some((prefix) => f.startsWith(prefix)),
  );

  if (sourceFiles.length === 0) {
    if (params.findingsRoutingApproved === true) {
      stderrWrite(`[${step.name}] no-op in approved findings-routing path — no mandatory findings, not escalating`);
      return undefined;
    }
    stderrWrite(`[${step.name}] no-op detected: no source files changed — overriding verdict to needs-fix`);
    return "needs-fix";
  }

  return undefined;
}
