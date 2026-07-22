/**
 * StepCompletion — verdict derivation extracted from StepExecutor.finalizeStep.
 *
 * Extracts the verdict-derivation block (:793-928) from finalizeStep into a
 * named, testable pure-ish function. Side effects (store.persist, store.fail,
 * appendHistory, attachStateAndRethrow) remain in the executor.
 *
 * Design:
 *   - deriveStepCompletion calls computeExtraScopeFindings (async, I/O via seam).
 *   - deriveStepCompletion calls runtimeStrategy.verifyFindingRefs (async, I/O via seam).
 *   - No store writes of any kind.
 *   - The agentResult type is extended with resultContent so the prose-parse path
 *     (CLI steps, agent steps without reportTool) is handled in one place.
 */
import { stderrWrite } from "../../logger/stdout.js";
import type { Step } from "./types.js";
import type { JobState, Verdict } from "../../state/schema.js";
import type { PipelineDeps } from "../types.js";
import type { BaseReportResult } from "../port/report-result.js";
import type { JudgeReportResult, ProducerReportResult, RequestReviewReportResult } from "../port/report-result.js";
import type { Finding, Evidence } from "../../kernel/report-result.js";
import type { PermissionScope } from "../pipeline/types.js";
import type { CompletionReportDiagnostic } from "../port/agent-runner.js";
import type { ModelUsage } from "../../state/schema.js";
import type { FindingRef } from "./judge-verdict.js";
import {
  JUDGE_REPORT_TOOL,
  CODE_REVIEW_REPORT_TOOL,
  REQUEST_REVIEW_REPORT_TOOL,
  CONFORMANCE_REPORT_TOOL,
} from "./report-tool.js";
import {
  deriveJudgeVerdict,
  deriveRequestReviewVerdict,
  deriveConformanceVerdict,
  collectVerdictAffectingFindings,
} from "./judge-verdict.js";
import { filterUndecidedFindings } from "../decision/decision-ledger.js";
import { computeExtraScopeFindings } from "./scope-check.js";
import {
  selectUnroutableCanonFindings,
  judgeEffectiveFixer,
  conformanceEffectiveFixer,
  buildCanonEscalationReason,
} from "./canon-escalation.js";
import { buildCanonWriteScope } from "./canon-write-scope.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The extended agentResult type accepted by deriveStepCompletion.
 * Adds resultContent (from finalizeStep's separate param) so the prose-parse
 * path can be handled inside deriveStepCompletion for both agent and CLI steps.
 */
export interface StepCompletionInput {
  resultContent?: string | null;
  sessionId?: string;
  agentBranch?: string;
  modelUsage?: Record<string, ModelUsage>;
  toolResult?: BaseReportResult | null;
  followUpAttempts?: number;
  transientRetryAttempts?: number;
  completionReportDiagnostics?: CompletionReportDiagnostic[];
  /**
   * T-03 (no-op detection): when set, overrides the derived verdict after all
   * normal computation completes. Used by runAgentStep to inject "needs-fix"
   * when code-fixer produced no source changes.
   */
  verdictOverride?: Verdict;
}

/**
 * Outcome of verdict derivation — what finalizeStep needs to record.
 *
 * pullRequest is populated only from the prose-parse path (pr-create step).
 * null means the step did not produce a PR record.
 */
export interface StepCompletion {
  verdict: Verdict;
  persistToolResult: (BaseReportResult & { findings?: Finding[]; evidence?: Evidence }) | null;
  /** Pull request info extracted from prose parse (pr-create step only). */
  pullRequest?: { url: string; number: number; createdAt: string };
  /**
   * Bite-evidence records extracted from the bite-evidence gate result file.
   * Present only when BiteEvidenceStep returns a non-deferred verdict with records.
   * commitSuccess() reflects this into state.biteEvidence (T-08, R4).
   */
  biteEvidence?: import("../../state/schema.js").BiteEvidenceRecord[];
  /**
   * Canon-finding escalation reason.
   * Set when the verdict is "escalation" caused by a fixable finding on a
   * protected canon path that the effective fixer cannot legally write.
   * Absent for non-canon escalations (vacuous / decision-needed / finding-ref).
   */
  escalationReason?: string;
}

// ---------------------------------------------------------------------------
// deriveStepCompletion
// ---------------------------------------------------------------------------

/**
 * Derive the completion outcome for a step.
 *
 * Mirrors finalizeStep verdict-derivation block (:793-928) exactly:
 *   - Typed path (reportTool set): judge / conformance / request-review / producer variants.
 *   - Prose-parse path (no reportTool): step.parseResult → verdict.
 *   - Scope finding synthesis for judge/conformance steps.
 *   - Finding ref verification → escalation override.
 *   - Null verdict → "escalation" fallback + stderr warning.
 *   - verdictOverride application (guarded by verdict !== "error").
 *
 * @param step            Step declaration (kind, reportTool, judgeVerdictFn, etc.).
 * @param state           Current job state (branch, decisions, steps, etc.).
 * @param deps            Pipeline dependencies (runtimeStrategy, cwd, etc.).
 * @param agentResult     Combined agent result + resultContent. undefined = CLI step.
 * @param permissionScope Declared permission scope for scope-breach synthesis.
 */
export async function deriveStepCompletion(
  step: Step,
  state: JobState,
  deps: PipelineDeps,
  agentResult: StepCompletionInput | undefined,
  permissionScope: PermissionScope | undefined,
): Promise<StepCompletion> {
  let verdict: Verdict | string | null = null;
  let parsed: import("./types.js").ParsedStepResult | null = null;

  // T-01 (outcome-cutover R3): typed outcome takes priority over prose parse.
  const stepReportTool = "reportTool" in step ? step.reportTool : undefined;
  const isConformanceStep = stepReportTool === CONFORMANCE_REPORT_TOOL;
  const isJudgeStep =
    stepReportTool === JUDGE_REPORT_TOOL ||
    stepReportTool === CODE_REVIEW_REPORT_TOOL ||
    isConformanceStep;
  const isRequestReviewStep = stepReportTool === REQUEST_REVIEW_REPORT_TOOL;

  // Track effective toolResult for persistence.
  let persistToolResult: (BaseReportResult & { findings?: Finding[]; evidence?: Evidence }) | null =
    (agentResult?.toolResult as (BaseReportResult & { findings?: Finding[]; evidence?: Evidence }) | null | undefined) ?? null;

  const resultContent = agentResult?.resultContent ?? null;

  // Build canon write scope once for this step completion (used in verdict derivation).
  // buildCanonWriteScope is pure (no I/O) — safe to call unconditionally.
  const canonScope = buildCanonWriteScope(state, deps);

  // Track the undecided findings for the last judge/conformance path to compute escalationReason.
  let lastUndecidedFindings: Finding[] | null = null;
  let lastIsConformancePath = false;

  if (agentResult !== undefined && stepReportTool !== undefined) {
    // Agent step with reportTool — use typed outcome exclusively.
    const toolResult = agentResult.toolResult;
    if (toolResult !== null && toolResult !== undefined) {
      // Non-null toolResult: derive verdict from findings (judge) or fields (producer).

      const extraScopeFindings = (isJudgeStep || isConformanceStep)
        ? await computeExtraScopeFindings(step.name, permissionScope, state, deps)
        : [];

      if (isRequestReviewStep) {
        const tr = toolResult as RequestReviewReportResult;
        const allFindings = tr.findings ?? [];
        const undecidedFindings = filterUndecidedFindings(step.name, allFindings, state.decisions);
        if (tr.evidence?.checked === 0) {
          stderrWrite(`[${step.name}] vacuous check: checked=0 — 検証実績ゼロのため needs-discussion として扱われます`);
        }
        verdict = deriveRequestReviewVerdict(undecidedFindings, tr.ok, tr.evidence);
        // request-review is not subject to canon escalation routing
      } else if (isConformanceStep) {
        const tr = toolResult as JudgeReportResult;
        const allFindings = [...(tr.findings ?? []), ...extraScopeFindings];
        const undecidedFindings = filterUndecidedFindings(step.name, allFindings, state.decisions);
        if (tr.evidence?.checked === 0) {
          stderrWrite(`[${step.name}] vacuous check: checked=0 — 検証実績ゼロのため判定不能として扱われます`);
        }
        verdict = deriveConformanceVerdict(undecidedFindings, tr.ok, tr.evidence, canonScope);
        lastUndecidedFindings = undecidedFindings;
        lastIsConformancePath = true;
      } else if (isJudgeStep) {
        const tr = toolResult as JudgeReportResult;
        const allFindings = [...(tr.findings ?? []), ...extraScopeFindings];
        const undecidedFindings = filterUndecidedFindings(step.name, allFindings, state.decisions);
        const verdictFn =
          "judgeVerdictFn" in step && step.judgeVerdictFn
            ? step.judgeVerdictFn
            : deriveJudgeVerdict;
        if (tr.evidence?.checked === 0) {
          stderrWrite(`[${step.name}] vacuous check: checked=0 — 検証実績ゼロのため判定不能として扱われます`);
        }
        verdict = verdictFn(undecidedFindings, tr.ok, tr.evidence, canonScope);
        lastUndecidedFindings = undecidedFindings;
        lastIsConformancePath = false;
      } else {
        // producer: status "error" → "error", else completionVerdict (fallback "success")
        const completionVerdict =
          "completionVerdict" in step
            ? (step as { completionVerdict?: Verdict }).completionVerdict
            : undefined;
        verdict =
          (toolResult as ProducerReportResult).status === "error"
            ? "error"
            : (completionVerdict ?? "success");
      }

      // Build effective toolResult for persistence (scope findings merged when present).
      const effectiveToolResult: BaseReportResult & { findings?: Finding[]; evidence?: Evidence } =
        extraScopeFindings.length > 0
          ? {
              ...(toolResult as JudgeReportResult),
              findings: [
                ...((toolResult as JudgeReportResult).findings ?? []),
                ...extraScopeFindings,
              ],
            }
          : (toolResult as BaseReportResult & { findings?: Finding[] });
      persistToolResult = effectiveToolResult;

      // Post-verdict: verify finding refs for judge / request-review steps.
      if ((isJudgeStep || isRequestReviewStep) && deps.runtimeStrategy) {
        const tr = effectiveToolResult as JudgeReportResult | RequestReviewReportResult;
        const allFindings = tr.findings ?? [];
        const undecidedFindings = filterUndecidedFindings(step.name, allFindings, state.decisions);
        const affectingFindings = collectVerdictAffectingFindings(undecidedFindings);
        if (affectingFindings.length > 0) {
          const refs: FindingRef[] = affectingFindings.map((f) => ({ file: f.file, line: f.line }));
          const cwd = deps.cwd ?? process.cwd();
          const nonExistent = await deps.runtimeStrategy.verifyFindingRefs(
            refs,
            cwd,
            state.branch ?? null,
          );
          if (nonExistent.length > 0) {
            verdict = "escalation";
          }
        }
      }
    } else {
      // Null toolResult (no-tool-call proceed path) — step-class based fallback.
      if (isRequestReviewStep) {
        verdict = "needs-discussion";
      } else if (isJudgeStep) {
        verdict = "escalation";
      } else {
        const completionVerdict =
          "completionVerdict" in step
            ? (step as { completionVerdict?: Verdict }).completionVerdict
            : undefined;
        verdict = completionVerdict ?? "success";
      }
    }
  } else {
    // Prose parse path: CLI steps or agent steps without reportTool.
    if (resultContent !== null) {
      parsed = step.parseResult(resultContent, deps);
      verdict = parsed.verdict;
    } else if ("completionVerdict" in step) {
      verdict = (step as { completionVerdict?: Verdict | null }).completionVerdict ?? null;
    }
  }

  // Null verdict → escalation fallback + warning.
  if (verdict === null) {
    stderrWrite(
      `Warning: Could not parse verdict from ${step.kind} step '${step.name}'. Treating as escalation.`,
    );
  }
  verdict = verdict ?? "escalation";

  // verdictOverride: do not override producer status:error.
  if (agentResult?.verdictOverride !== undefined && verdict !== "error") {
    verdict = agentResult.verdictOverride;
  }

  // Compute escalationReason when verdict is "escalation" due to unroutable canon findings.
  let escalationReason: string | undefined;
  if (verdict === "escalation" && lastUndecidedFindings !== null) {
    const resolver = lastIsConformancePath ? conformanceEffectiveFixer : judgeEffectiveFixer;
    const unroutable = selectUnroutableCanonFindings(lastUndecidedFindings, canonScope, resolver);
    if (unroutable.length > 0) {
      escalationReason = buildCanonEscalationReason(unroutable);
    }
  }

  return {
    verdict: verdict as Verdict,
    persistToolResult,
    pullRequest: parsed?.pullRequest,
    ...(parsed?.biteEvidence !== undefined ? { biteEvidence: parsed.biteEvidence } : {}),
    ...(escalationReason !== undefined ? { escalationReason } : {}),
  };
}
