/**
 * collectRoutedFixerFindings — source of truth for "findings routed to the current
 * code-fixer run".
 *
 * This module moves the private predicates from code-fixer.ts into a neutral,
 * light module so they can be shared with executor.ts (no-op exemption set
 * derivation) without introducing import cycles.
 *
 * Consumer: executor's no-op exemption set derivation (T-03, noop-detect-finding-target-exemption).
 */
import type { JobState } from "../../state/schema.js";
import type { Finding } from "../../kernel/report-result.js";
import { STEP_NAMES } from "./step-names.js";
import { getConformanceFixContext, getLatestJudgeFindings } from "./fixer-helpers.js";
import { deriveImplFixerChain, resolveActiveReviewer } from "../pipeline/reviewer-chain.js";
import { collectParallelFixerFindings } from "../pipeline/findings-ledger.js";
import { buildCanonWriteScopeFromState } from "./canon-write-scope.js";
import { CUSTOM_REVIEWERS_STEP_NAME } from "../pipeline/types.js";
import { REGRESSION_GATE_STEP_NAME } from "./regression-gate.js";
import { selectFixerTargetFindings } from "./judge-verdict.js";

/**
 * Determine if the code-fixer is being invoked from the custom reviewer coordinator loop.
 *
 * Design D5 / D7 (reviewer-parallel-execution): in the composed path (custom reviewers
 * present), the code-fixer can be triggered by:
 * 1. conformance → code-fixer (conformanceFixInProgress — detected by getConformanceFixContext)
 * 2. regression-gate → code-fixer (regressionGateActive)
 * 3. code-review → code-fixer (standard, before coordinator starts)
 * 4. coordinator → code-fixer (custom reviewer needs-fix)
 *
 * This function detects case 4: composed path AND coordinator has run AND its latest
 * verdict is needs-fix.
 *
 * Standard path (no custom reviewers, state.reviewers empty) always returns false.
 *
 * Moved from code-fixer.ts and exported so routed-findings.ts and code-fixer.ts share
 * the same predicate implementation (no drift).
 */
export function isCoordinatorLoopActive(state: JobState): boolean {
  if (!state.reviewers?.length) return false; // standard path
  if (getConformanceFixContext(state, STEP_NAMES.CODE_FIXER) !== null) return false; // conformance triggered

  // Check if regression-gate is the active source
  const gateRuns = state.steps?.[REGRESSION_GATE_STEP_NAME] ?? [];
  if (gateRuns.length > 0) {
    const lastGate = gateRuns[gateRuns.length - 1];
    if (lastGate?.outcome.verdict === "needs-fix") return false; // regression-gate triggered
  }

  // Check if code-review is the active source (coordinator hasn't started yet)
  const coordinatorRuns = state.steps?.[CUSTOM_REVIEWERS_STEP_NAME] ?? [];
  if (coordinatorRuns.length === 0) return false; // coordinator hasn't run → code-review loop

  // Coordinator has run and its latest verdict indicates needs-fix triggered this fixer
  const lastCoordinator = coordinatorRuns[coordinatorRuns.length - 1];
  return lastCoordinator?.outcome.verdict === "needs-fix";
}

/**
 * Get needs-fix member names from the coordinator's last round.
 * Used to determine which result files to pre-validate and to collect findings.
 *
 * Moved from code-fixer.ts and exported so routed-findings.ts and code-fixer.ts share
 * the same implementation (no drift).
 */
export function getNeedsFixMembers(state: JobState): string[] {
  return (state.reviewers ?? [])
    .filter((r) => {
      const runs = state.steps?.[r.name] ?? [];
      if (runs.length === 0) return false;
      const last = runs[runs.length - 1];
      return last?.outcome.verdict === "needs-fix";
    })
    .map((r) => r.name);
}

/**
 * Collect findings routed to the current code-fixer run.
 *
 * Mirrors the same 3-branch precedence used in code-fixer.buildMessage so that
 * the finding set is always in sync with what the fixer actually receives.
 * Sharing the predicate functions (isCoordinatorLoopActive / getNeedsFixMembers)
 * ensures SELECTION does not drift between the two consumers.
 *
 * Branch 1 (highest priority): conformance triggered this fixer entry.
 * Branch 2: coordinator-loop active (custom reviewer needs-fix round).
 * Branch 3 (fallback): active reviewer in the standard / non-coordinator path.
 *
 * Pure function — no side effects, no I/O.
 *
 * Consumer: executor's no-op exemption set derivation.
 * The returned Finding[].file values are used as the findingTargetPaths param
 * passed to detectNoOp, exempting legitimate document changes from no-op detection.
 */
export function collectRoutedFixerFindings(state: JobState): Finding[] {
  // Branch 1: conformance triggered this fixer entry → use conformance findings
  const conformance = getConformanceFixContext(state, STEP_NAMES.CODE_FIXER);
  if (conformance !== null) return conformance;

  // Branch 2: coordinator-loop active → aggregate from all needs-fix members
  if (isCoordinatorLoopActive(state)) {
    const members = getNeedsFixMembers(state);
    return collectParallelFixerFindings(state, members, buildCanonWriteScopeFromState(state));
  }

  // Branch 3: active reviewer in the standard / non-coordinator path.
  // Apply severity policy (LOW excluded) — selectFixerTargetFindings is the single
  // authoritative place for the LOW exclusion in the routing layer.
  const chain = deriveImplFixerChain(state);
  const active = resolveActiveReviewer(state, chain);
  const allFindings = getLatestJudgeFindings(state, active) ?? [];
  return selectFixerTargetFindings(allFindings);
}
