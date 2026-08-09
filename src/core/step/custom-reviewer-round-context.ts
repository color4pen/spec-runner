/**
 * custom-reviewer-round-context.ts — custom reviewer 周回間 context の機械導出と注入ブロック生成。
 *
 * custom reviewer の iteration ≥ 2 で起動され、前周の自分自身の findings projection と
 * 前周以降の code-fixer commit 由来の変更 file 集合を reviewer に渡す。
 * また、operator 裁定（operatorAdjudications + decisions ledger）を注入する。
 *
 * Design:
 *   - I/O は runtimeStrategy port 背後のみ（node:child_process / git を直接 import しない）
 *   - 注入は one-shot（state への永続化なし。DynamicContext に乗せて buildMessage に渡す）
 *   - 導出できない場合（git 失敗・findings 欠落）は null を返して黙って degrade（throw しない）
 *   - 前周 context 縮退は all-or-nothing — 部分注入しない
 *   - operator 裁定 block は両 ledger 共に空のとき null（block なし）
 */
import type { JobState } from "../../state/schema.js";
import type { RuntimeStrategy } from "../port/runtime-strategy.js";
import { getLatestJudgeFindings } from "./fixer-helpers.js";
import { resolveCodeFixerRounds } from "./post-fix-context.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Prior-round context for custom reviewer injection.
 * Matches DynamicContext.customReviewerPriorRound.
 */
export type CustomReviewerPriorRound = {
  /** Prior-round custom reviewer findings (severity/resolution/file/title projection). */
  findings: { severity: string; resolution: string; file: string; title: string }[];
  /** Files changed by code-fixer after the prior reviewer round — machine-derived. */
  changedFiles: string[];
};

/**
 * Operator adjudication context for custom reviewer injection.
 * Matches DynamicContext.operatorAdjudicationContext.
 */
export type OperatorAdjudicationContext = {
  /** Operator adjudications from JobState.operatorAdjudications (resume --prompt). */
  adjudications: { text: string; step: string; recordedAt: string }[];
  /** Decisions from JobState.decisions ledger (issue-comment-derived). */
  decisions: { step: string; title: string; file: string; selectedOption: string; consequence: string; rationale: string }[];
};

// ---------------------------------------------------------------------------
// XML escape helper (pure)
// ---------------------------------------------------------------------------

/**
 * Escape XML special characters to prevent block boundary breakage.
 * < → &lt;  > → &gt;  & → &amp;
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------------
// Pure block builders
// ---------------------------------------------------------------------------

/**
 * Build the prior-round context injection block for custom reviewer messages.
 *
 * Returns a string enclosed in <prior-round-context>…</prior-round-context> XML tags.
 * Includes:
 *   - Prior-round findings (severity/resolution/file/title)
 *   - Files changed by code-fixer after the prior round (machine-derived)
 *   - Re-inspection protocol (Read-before-re-report, rationale requirement, 全量列挙)
 *
 * Pure function — no I/O.
 */
export function buildCustomReviewerPriorRoundBlock(ctx: CustomReviewerPriorRound): string {
  const lines: string[] = [];

  lines.push("<prior-round-context>");
  lines.push("");
  lines.push("## 前周レビュー context（iteration ≥ 2）");
  lines.push("");

  // --- Prior findings ---
  lines.push("### 前周 custom reviewer findings");
  lines.push("");
  if (ctx.findings.length === 0) {
    lines.push("前周指摘なし（前周は全 finding が approved）");
  } else {
    for (const f of ctx.findings) {
      lines.push(`- [${f.severity}] ${f.title} (${f.resolution}) — ${f.file}`);
    }
  }
  lines.push("");

  // --- Changed files (machine-derived) ---
  lines.push("### 前周以降の code-fixer 変更 file（commit diff 由来・machine-derived）");
  lines.push("");
  if (ctx.changedFiles.length === 0) {
    lines.push("変更なし（machine-derived: commit diff から機械導出）");
  } else {
    for (const f of ctx.changedFiles) {
      lines.push(`- ${f}`);
    }
  }
  lines.push("");

  // --- Re-inspection protocol ---
  lines.push("### 再指摘プロトコル");
  lines.push("");
  lines.push("前周指摘と同一対象を再指摘する場合は以下を守ること:");
  lines.push("1. 現在のファイル内容を Read tool で読み直してから再指摘する");
  lines.push("2. なぜ修正が不十分かを rationale に明示する。解消済みの指摘は再指摘しない");
  lines.push("3. 全量列挙を維持する: この round で確認できる finding をすべて列挙する（前周 approved 観点も含め免除なし）");
  lines.push("");

  lines.push("</prior-round-context>");
  return lines.join("\n");
}

/**
 * Build the operator adjudication injection block for custom reviewer messages.
 *
 * Returns a string enclosed in <operator-adjudication>…</operator-adjudication> XML tags.
 * Includes:
 *   - Operator adjudications (from resume --prompt) with step labels
 *   - Decisions from the decisions ledger (issue-comment-derived) with step labels
 *   - Rebuttal protocol: must provide rationale when re-raising a ruled finding
 *
 * XML special characters in free-form text are escaped before embedding.
 * Pure function — no I/O.
 */
export function buildOperatorAdjudicationBlock(ctx: OperatorAdjudicationContext): string {
  const lines: string[] = [];

  lines.push("<operator-adjudication>");
  lines.push("");
  lines.push("## Operator 裁定（resume / issue-comment 由来）");
  lines.push("");
  lines.push("以下は operator が裁定済みの事項です。");
  lines.push("裁定済み事項を再指摘する場合は、裁定 rationale への反論を rationale に明示してください。");
  lines.push("反論なき再指摘は escalation にカウントされます。");
  lines.push("");

  // --- Operator adjudications (resume --prompt) ---
  if (ctx.adjudications.length > 0) {
    lines.push("### Operator 裁定記録（resume --prompt 由来）");
    lines.push("");
    for (const adj of ctx.adjudications) {
      lines.push(`- [step: ${escapeXml(adj.step)}] ${escapeXml(adj.text)}`);
    }
    lines.push("");
  }

  // --- Decisions ledger (issue-comment-derived) ---
  if (ctx.decisions.length > 0) {
    lines.push("### 裁定済み decisions（issue-comment 由来）");
    lines.push("");
    for (const d of ctx.decisions) {
      lines.push(`- [step: ${escapeXml(d.step)}] ${escapeXml(d.title)} (${escapeXml(d.file)})`);
      lines.push(`  選択: ${escapeXml(d.selectedOption)} — ${escapeXml(d.consequence)}`);
      if (d.rationale) {
        lines.push(`  rationale: ${escapeXml(d.rationale)}`);
      }
    }
    lines.push("");
  }

  lines.push("</operator-adjudication>");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Pure derivation: operator adjudication context (no I/O)
// ---------------------------------------------------------------------------

/**
 * Derive operator adjudication context from job state.
 *
 * Combines state.operatorAdjudications (free-form resume --prompt records) and
 * state.decisions (issue-comment-derived structured decisions) into a unified projection.
 *
 * Returns null when both sources are empty (block should not be injected).
 * Returns { adjudications, decisions } when either source is non-empty.
 *
 * DecisionRecord.resumeComment is excluded — its content overlaps with
 * operatorAdjudications[*].text (both carry the operator's prose ruling).
 *
 * Pure function — no I/O.
 */
export function deriveOperatorAdjudicationContext(state: JobState): OperatorAdjudicationContext | null {
  const adjudications = (state.operatorAdjudications ?? []).map((a) => ({
    text: a.text,
    step: a.step,
    recordedAt: a.recordedAt,
  }));

  const decisions = (state.decisions ?? []).map((d) => ({
    step: d.step,
    title: d.finding.title ?? "",
    file: d.finding.file ?? "",
    selectedOption: d.selectedOption.label ?? "",
    consequence: d.selectedOption.consequence ?? "",
    rationale: d.finding.rationale ?? "",
  }));

  if (adjudications.length === 0 && decisions.length === 0) return null;

  return { adjudications, decisions };
}

// ---------------------------------------------------------------------------
// Async derivation: prior-round context (I/O via runtimeStrategy port)
// ---------------------------------------------------------------------------

/**
 * Derive prior-round context for a custom reviewer at iteration ≥ 2.
 *
 * Returns null (injection skipped) in any of these cases:
 * - iteration < 2 (no prior round)
 * - state.steps[reviewerName] is absent or empty (no prior run recorded)
 * - prior reviewer StepRun has no toolResult (getLatestJudgeFindings returns null)
 * - runtimeStrategy is absent or has no listCommitChangedFiles (managed runtime)
 * - listCommitChangedFiles returns { kind: "unavailable" } for any commit
 * - listCommitChangedFiles throws for any commit (all-or-nothing)
 *
 * Empty findings array (all approved in prior round) is NOT treated as null —
 * the derivation continues with changedFiles.
 *
 * On success, returns { findings, changedFiles } where:
 * - findings: projection of prior custom reviewer toolResult.findings
 * - changedFiles: union of files changed by code-fixer commits after prior reviewer endedAt
 *   (machine-derived, not self-reported; deduplicated)
 *
 * Never throws — all failures degrade to null.
 */
export async function deriveCustomReviewerPriorRound(params: {
  state: JobState;
  reviewerName: string;
  iteration: number;
  cwd: string;
  runtimeStrategy: unknown;
}): Promise<CustomReviewerPriorRound | null> {
  const { state, reviewerName, iteration, cwd, runtimeStrategy } = params;

  try {
    // Guard: only inject for iteration ≥ 2
    if (iteration < 2) return null;

    // Guard: prior reviewer runs must exist
    const reviewerRuns = state.steps?.[reviewerName];
    if (!reviewerRuns || reviewerRuns.length === 0) return null;

    // Resolve prior reviewer endedAt (last run's endedAt)
    const lastReviewerRun = reviewerRuns[reviewerRuns.length - 1];
    if (!lastReviewerRun?.endedAt) return null;
    const priorReviewerEndedAt = lastReviewerRun.endedAt;

    // Guard: prior findings must be derivable (null = toolResult absent or findings absent)
    const rawFindings = getLatestJudgeFindings(state, reviewerName);
    if (rawFindings === null) return null;

    // Guard: runtimeStrategy must provide listCommitChangedFiles
    const strategy = runtimeStrategy as RuntimeStrategy | undefined;
    if (!strategy?.listCommitChangedFiles) return null;

    // Resolve code-fixer rounds after prior reviewer endedAt
    const allFixerRounds = resolveCodeFixerRounds(state);
    const relevantRounds = allFixerRounds.filter((r) => r.endedAt > priorReviewerEndedAt);

    // If no fixer rounds after prior reviewer, changedFiles is empty (not null — code fixer may not have run)
    // Build union of changed files from all relevant fixer commits (all-or-nothing)
    const changedFilesSet = new Set<string>();
    for (const round of relevantRounds) {
      const result = await strategy.listCommitChangedFiles(round.commitOid, cwd);
      if (result.kind !== "success") return null; // all-or-nothing
      for (const f of result.files) {
        changedFilesSet.add(f);
      }
    }

    // Project findings (severity/resolution/file/title only)
    const findings = rawFindings.map((f) => ({
      severity: f.severity,
      resolution: f.resolution,
      file: f.file,
      title: f.title,
    }));

    return {
      findings,
      changedFiles: Array.from(changedFilesSet),
    };
  } catch {
    // All-or-nothing: any failure degrades to null, step continues normally
    return null;
  }
}
